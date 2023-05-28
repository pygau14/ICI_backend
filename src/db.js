const mysql = require('mysql');

const pool = mysql.createPool({
    host : '82.180.143.52',
    port : '3306',
    user : 'u176507776_ICI_DB_USER',
    password : 'DB123_main',
    database : 'u176507776_LMS_DB_MAIN'
});



module.exports = pool;