const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const dotenv = require ('dotenv')
const crypto = require('crypto');
const axios = require('axios');
const app = express();

//Create a new SQLite database and open a connection
 const db = new sqlite3.Database(':memory:');

//Create the "accounts" table in the database
db.run(`CREATE TABLE IF NOT EXISTS accounts(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    secret_token TEXT NOT NULL,
    website TEXT
)`);

//Create the "destinations" table in the database
db.run(`CREATE TABLE IF NOT EXISTS destinations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    headers TEXT NOT NULL,
    FOREIGN KEY(account_id)REFERENCES accounts(id) ON DELETE CASCADE
)`);

//Enable JSON request body parsing
app.use(express.json());

//Account Module: Create an account
app.post('/accounts', (req,res) => {
  const {email, name, website} = req.body;
  const secretToken = generateSecretToken(16);

  db.run(`
  INSERT INTO accounts (email, name, secret_token, website) VALUES (?,?,?,?)`,
  [email, name, secretToken, website],
  function (err) {
    if (err) {
        console.error(err);
        return res.status(500).json({error: 'Failed to create the account'});
    }

    res.status(201).json({
        id: this.lastID,
        email,
        name,
        secretToken,
        website,
    });
  }
  );
});

//Account Module : Delete an account
app.delete('/accounts/:accountId', (req, res) => {

    const accountId = req.params.accountId;

    db.run(`DELETE FROM accounts WHERE id = ?`, accountId, function(err){
        if (err) {
            console.error(err);
            return res.status(500).json({error: 'Failed to delete the account'});
        }
        res.sendStatus(204).json({
            success: true
        });
    });
});


//Destionation Module: Create a destination for an account
app.post('/accounts/:accountId/destination', (req, res)=>{
    const accountId = req.params.accountId;
    const {url, method, headers } = req.body;

    db.run(`
    INSERT INTO destinations (account_id, url, method, headers) VALUES (?,?,?,?)`,
    [accountId, url, method, JSON.stringify(headers)],
    function(err){
        if(err){
            console.error(err);
            return res.status(500).json({error: 'Failed to create the destination'});
        }
        res.status(201).json({
            id: this.lastID,
            account_id: accountId,
            url,
            method,
            headers,

        });
    }
    );
});

//Destination Module : Delete a destination
app.delete('/destinations/:destinationId', (req, res)=>{
   const destinationId = req.params.destinationId;

   db.run(`DELETE FROM destination WHERE id = ? `,destinationId, function(err){
    if(err){    
        console.error(err);
        return res.status(500).json({error:'Failed to delete the destination'});
    }
    res.sendStatus(204).json({
        success: true
    });
   });
});

//Get all destination
app.get('/destination', (req, res)=>{
    db.all(`SELECT * FROM destination`, (err, rows)=>{
        if(err){
            console.error(err);
            return res.status(500).json({error: 'Failed to get the destination'});
        }
        res.json(rows).json({
            success: true
        });
    });
});

//Get destinations for an account
app.get('/accounts/:accountId/destination', (req, res)=>{
    const accountId = req.params.accountId;

    db.all(`SELECT * FROM destination WHERE account_id  = ?`, accountId,(err, rows)=>{
        if(err){
        console.error(err);
            return res.status(500).json({error: 'Failed to get the destination'});
        }
        res.json(rows).json({
            success: true
        });
    });
});

//Get all accounts
app.get('/accounts',(req, res)=>{
    db.all(`SELECT * FROM accounts`,(err, rows)=>{
        if(err){
            console.error(err);
                return res.status(500).json({error: 'Failed to get the accounts'});
            }
            res.json(rows);
    });
});

//Data handler module: Receive data and send it to destinations
app.post('/server/incoming_data',(req, res)=>{
    const {headers} = req;
    const secretToken = headers['cl-x-token'];
    const data  = req.body;
    
    if(!secretToken) {
        return res.status(401).json({error: 'Unauthendicated'});
    }
    db.get(`SELECT * FROM accounts WHERE secret_token = ?`, secretToken,(err, account)=> {
      if(err){
        console.error(err);
                return res.status(500).json({error: 'Failed to process the data'});
      }
      if(!account){
      return res.status(401).json({error: 'Unauthenticated'});
    }
   
    const destinationsQuery = `SELECT * FROM destination WHERE account_id = ?`;
    db.all(destinationsQuery, account.id, (err,destination)=>{
        if(err){
            console.error(err);
                    return res.status(500).json({error: 'Failed to process the data'});
          }
          destination.forEach((destination) => {
            sendToDestination(destination, data);
            
          });
          res.sendStatus(200);
    });
});

});


//Helper function to send data to a destination

function sendToDestination(destination, data){
    const {url, method, headers} = destination;


    //prepare the request to send data to a destination
    const requestOptions = {
        method,
        url,
        headers,
    };

    //Adjust the logic based on the destination's HTTP method and data format requirements
    if(method == 'GET'){
        requestOptions.params = data;
    } else{
        requestOptions.data = data;
    }

    //Send the request using Axios
    axios(requestOptions)
    .then((response)=>{
        console.log(`Data sent successfully to destination: ${url}`);
        console.log(`Response : ${response.data}`);

    })
    .catch((error)=>{
       console.error(`Failed to send to destination: ${url}`);
       console.error(error);
    });
 }

 //Helper function to generate a secret token
 function generateSecretToken(length){
    const buffer = crypto.randomBytes(length);
    return buffer.toString('hex');
 }


 //Start the Express Server and Environmental path Config
 dotenv.config({path:"config/config.env"})
 app.listen(process.env.PORT, ()=>{
    console.log(`Server listening at http://localhost:${process.env.PORT}`);
 });