const express = require('express');
const cors = require('cors');
const app = express();
const path = require('path')

 app.use(cors());

const routes = require('./routes');

const cookieParser = require('cookie-parser');
app.use(cookieParser());

app.use('/pdf', express.static(path.join(__dirname, 'NCERT')));

// Serve static files from the 'public' directory
app.use(express.static('src'));
app.use(express.json());
app.use('/',routes);

app.listen(3000,()=>{
  console.log("Server is running at Port : 3000")
})
