const express = require('express');
const router = express.Router();
// jwt token for auth
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const pool = require('./db');
const bodyParser = require('body-parser');
const {google} = require('googleapis');

// Parse JSON bodies
router.use(bodyParser.json());

// Parse URL-encoded bodies
router.use(bodyParser.urlencoded({ extended: true }));
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');


const storage = multer.memoryStorage();
const upload = multer({storage : storage});

const ncertupload = multer({ dest: 'src/NCERT/' });


// Configure nodemailer for sending emails
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: '1hk16ec023@hkbk.edu.in',
    pass: 'bmtkcrfwdswsribn'
  }
});

//sign up route
router.post('/signup',upload.single('profile_picture'), async(req,res)=>{
  const {name, email , password ,doj, mobile_no, dob , country , state , city , street_address , school_name, institute_name , courses , subjects } = req.body;
  const profile_picture = req.file ? req.file.buffer : null ;


  // if (password !== confirmPassword){
  //   return res.status(400).json({message : 'Password do not match'});
  // }

  const hashedPassword  = await bcrypt.hash(password,10);

  try {
    try {
      await pool.query('INSERT INTO users (name, email, password,doj,mobile_no) VALUES (?, ?, ?,?,?)',[name, email , hashedPassword,doj,mobile_no],(error,result)=>{
        if(error){
          console.log(error);
          if(error.errno == 1062){
            res.status(401).json({message : 'Email ID is already in use please use different for Sign Up!'})
          }
        }
        else {
          pool.query('INSERT INTO user_details (name , email , mobile_no , dob, country , state, city , street_address , school_name , institute_name, courses, subjects) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[name , email , mobile_no , dob,country, state, city, street_address, school_name , institute_name , courses,subjects],(err,results)=>{
            if(err){
              console.log(error);
            }
            else{
              console.log('Sign up done for this credentials')
              res.status(200).json({message : 'Sign Up Successfully'});
            }
          })
        }
      });
    }
    catch(e){
      await client.query('ROLLBACK');
      throw e;
    }
  }
  catch(e){
    console.error(e);
    return res.status(500).json({message : 'Internal server error'});
  }
});


// API's for google sign in 
// Endpoint for initiating Google Sign-in
router.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  });
  res.redirect(url);
});


// Callback endpoint for handling the Google Sign-in callback
router.get('/auth/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Extract necessary user information
    const email = userInfo.data.email;
   // You need to add a method to fetch the mobile number
    const name = userInfo.data.name;

    // Store user information in the MySQL database
    const user = {
      email,
      name,
    };

    pool.query('INSERT INTO users SET ?', user, (error, results) => {
      if (error) {
        console.error('Error storing user in database:', error);
        res.status(500).send('Error storing user in database');
      } else {
        console.log('User stored in database:', results);
        res.send('User stored in database');
      }
    });
  } catch (error) {
    console.error('Error authenticating with Google:', error);
    res.status(500).send('Error authenticating with Google');
  }
});

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());


router.post('/login',upload.none(),async(req,res)=>{
  const {email , password} = req.body;
  

  try {
    try{
      await pool.query('SELECT * FROM users WHERE email = ?', [email],async (error,result)=>{
        if(error){
          console.log(error);

        }
        else{
          if(result.length > 0){
            const passwordMatch = await bcrypt.compare(password, result[0].password);
            if(!passwordMatch){
              console.log('password is wrong');
              return res.status(401).json({message : 'Invalid email and password'});
            }
            else{
              const token = jwt.sign({userID : result[0].id,name : result[0].name, email : result[0].email},'secret',{ expiresIn: '1h' });
              res.cookie('token', token, { httpOnly: true });
              res.status(200).json({token : token ,message : 'Login Sucessful', userID: result[0].id, name : result[0].name,email : result[0].email});
            }
          }
          else{
            console.log('email is wrong');
            return res.status(401).json({message:'Invalid email and password'});
          }
        }
        
      });

    }catch (e) {
      console.log('internal catch error');
      console.error(e);
      res.status(500).json({ message: 'Internal server error' });
    }
  }catch (e) {
    console.log('outer catch erro');
    console.error(e);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Middleware to parse JSON data
router.use(express.json());
// Route to handle the password reset submission
router.post('/reset-password',upload.none(), async (req, res) => {
  const email = req.body.email;
  console.log(req.body);
  console.log(email);

  // Check if the email exists in the users table
  const checkEmailQuery = `SELECT * FROM users WHERE email = '${email}'`;

  pool.query(checkEmailQuery, (err, result) => {
    if (err) {
      console.error('Error checking email:', err);
      res.status(500).send('An error occurred');
      return;
    }

    if (result.length === 0) {
      // Email does not exist in the database
      res.status(400).send('Email not found');
    } 
    else {
      console.log('email is found')
      // Generate a unique reset token (you can use libraries like 'uuid' for this)
      const resetToken = 'your_reset_token';

      // Save the reset token in the database
      const saveTokenQuery = `UPDATE users SET reset_token = '${resetToken}' WHERE email = '${email}'`;

      pool.query(saveTokenQuery, (err, result) => {
        if (err) {
          console.error('Error saving reset token:', err);
          res.status(500).send('An error occurred');
          return;
        }

        // Compose the reset email
        const resetUrl = `https://ici-backend.onrender.com/reset-password/new?token=${resetToken}`;
        const mailOptions = {
          from: '1hk16ec023@hkbk.edu.in',
          to: email,
          subject: 'Password Reset',
          html: `<p>Please click the following link to reset your password:</p>
                <a href="${resetUrl}">${resetUrl}</a>`
        };

        // Send the reset email
        transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            console.error('Error sending reset email:', err);
            res.status(500).send('An error occurred');
            return;
          }
          console.log('Reset email sent:', info.response);
          res.send('Reset email sent');
        });
      })
    }
});
});

// Route to render the new password page
router.get('/reset-password/new', (req, res) => {
  const token = req.query.token;

  // Verify the reset token in the users table
  const verifyTokenQuery = `SELECT * FROM users WHERE reset_token = '${token}'`;

  pool.query(verifyTokenQuery, (err, result) => {
    if (err) {
      console.error('Error verifying reset token:', err);
      res.status(500).send('An error occurred');
      return;
    }

    if (result.length === 0) {
      // Invalid reset token
      res.status(400).send('Invalid reset token');
    } else {
      res.sendFile(__dirname + '/newPassword.html');
    }
  });
});

 // Route to handle the new password submission
router.post('/reset-password/new', (req, res) => {
  const token = req.query.token;
  const newPassword = req.body.newPassword;

  // Hash the new password with bcrypt
  bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      res.status(500).send('An error occurred');
      return;
    }

    // Update the password in the users table
    const updatePasswordQuery = `UPDATE users SET password = '${hashedPassword}', reset_token = NULL WHERE reset_token = '${token}'`;

    pool.query(updatePasswordQuery, (err, result) => {
      if (err) {
        console.error('Error updating password:', err);
        res.status(500).send('An error occurred');
        return;
      }

      console.log('Password updated');
      res.send('Password updated');
    });
  });
}); 

router.post('/resetPassword/admin',upload.none(), async (req,res)=>{
  const { email,oldpassword , newpassword } = req.body;
  console.log(email , newpassword);
  try {
    // Generate the hashed password using bcrypt with 10 rounds of hashing
    const hashedPassword = await bcrypt.hash(newpassword, 10);
   
    // Update the hashed password in the "users" table where email matches
    pool.query('UPDATE users SET password = ? WHERE email = ? ', [hashedPassword, email],(err, results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message: 'Internal server error'});
      }
      else{
        // Send a success response
      console.log(results);
      res.status(200).json({ message: 'Password updated successfully' });
      }
    }); 
  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }

})



router.post('/admin-login',upload.none(),async (req,res)=>{
  const {email , password}  =req.body;
  console.log('Admin login Needed');
  console.log(email , password);

  try{
    pool.query('SELECT * FROM admin_users WHERE email = ? AND PASSWORD = ?',[email, password],(err, result)=>{
      if(err){
        console.log(err);
        res.json(500).json({message : 'Internal Server error'});
      }else {
        console.log(result);
        const token = jwt.sign({userID : result[0].admin_id,name : result[0].name, email : result[0].email},'secret',{ expiresIn: '1h' });
        res.cookie('token2', token, { httpOnly: true });
        res.status(200).json({token : token ,message : 'Login Sucessful', userID: result[0].id, name : result[0].name,email : result[0].email});
      }
    })
  }catch{
    console.log('Error');
    res.json(500).json({message : 'Internal Server error'});
  }
})











// total courses
router.get('/api/courses',async (req,res)=>{
  try{
    // Query the popular_courses table for courses with ratings 4 and 5
    
    pool.query('SELECT  class, subject_name, chapter_name, topic_name, course_url, rating FROM popular2',(err,results)=>{
      if(err){
        console.log(err);
      }
      
      // Create an array to store the final objects
    const dataArr = [];

    // Iterate through the fetched results
    results.forEach((row) => {
      const { class: className, subject_name: subjectName, chapter_name: chapterName, topic_name: topicName, course_url: courseUrl, rating } = row;

      // Check if an object for the current class, subject, and chapter already exists in the dataArr
      const existingObjIndex = dataArr.findIndex((obj) => obj.class === className && obj.subject_name === subjectName && obj.chapter_name === chapterName);

      if (existingObjIndex !== -1) {
        // Object for class, subject, and chapter already exists, push the topic object to the existing topic_list array
        dataArr[existingObjIndex].topic_list.push({
          topic_name: topicName,
          course_url: courseUrl,
          rating,
        });
      } else {
        // Object for class, subject, and chapter doesn't exist, create a new object
        const newObj = {
          class: className,
          subject_name: subjectName,
          chapter_name: chapterName,
          topic_list: [
            {
              topic_name: topicName,
              course_url: courseUrl,
              rating,
            },
          ],
        };

        dataArr.push(newObj);
      }
    });

    // Send the final array of objects as the response
    res.status(200).json(dataArr)

  });
    

  }catch(error){
    console.error('Error fetching course',error);
    res.status(500).json({message : 'Error fetching course'})
  }
});

// Assuming you have already set up the required dependencies and database connection
// router for storing courses added by user
router.post('/api/add-course',upload.none(), async(req,res)=>{
  const {name , email , className , subject_name, chapter_name , topics_name, course_url} = req.body;
  try{
    pool.query('INSERT INTO student_course (name , email , class, subject_name,chapter_name,topics_name,course_url) VALUES (?,?,?,?,?,?,?)',[name,email ,className,subject_name,chapter_name,topics_name,course_url],(err,result)=>{
      if(err){
        console.log(err);
      }
      console.log('student_course added');
      res.status(200).json({message:'Course added successfully'})
 ;   })
  }catch(e){
    console.log(e);
    res.status(500).json({message:'Internal server error'});
  }
});

// Route to handle the data retrieval for courses opted by user
router.post('/fetch/student/course',upload.none(), (req, res) => {
  const { name, email } = req.body;
  console.log(name,email);

  // Query to fetch data from the student_courses table
  const query = `SELECT * FROM student_course WHERE name = ? AND email = ?`;

  // Execute the query
  pool.query(query, [name, email], (error, results) => {
    if (error) {
      console.error('Error executing MySQL query:', error);
      res.status(500).json({ error: 'Error fetching data from the database' });
    } else {
      // Prepare the array of objects to send to the frontend
      const data = results.map(result => ({
        class: result.class,
        subject_name: result.subject_name,
        chapter_name: result.chapter_name,
        topics_name : result.topics_name.split("+"),
        course_url : result.course_url.split("+"),
      }));

      res.status(200).json(data);
    }
  });
});




// Handle GET request to '/students' user info for admin
router.get('/students/details', (req, res) => {
  // Fetch data from the user_detail table
  pool.query('SELECT * FROM user_details', (error, results) => {
    if (error) throw error;
    console.log(results);
    res.status(200).json(results);
  });
});

// Handle GET request to '/students' for student dashboard
router.get('/student/detail', (req, res) => {
  const {email } = req.query;
  // Fetch data from the user_detail table
  pool.query('SELECT * FROM user_details WHERE email = ? ',[email], (error, results) => {
    if (error) throw error;
    console.log(results);
    res.status(200).json(results);
  });
});

// Handle GET request to '/users'
router.get('/users', (req, res) => {
  const { email } = req.query;
  console.log(email);

  // Fetch data from the users table based on the email
  pool.query('SELECT doj, id FROM users WHERE email = ?', [email], (error, results) => {
    if (error) throw error;

    res.json(results[0]);
  });
});

//route to handle multiple user_id together for leaderboard

router.get('/fetch/users/multiple', (req, res) => {
  try {
    const userIDs = req.query.user_ids.split('/'); // Split the user_ids string into an array
    console.log(userIDs);
    // Construct the SQL query with placeholders to prevent SQL injection
    const query = 'SELECT id, name, email FROM users WHERE id IN (?)';
    const queryParams = [userIDs]; // Pass the userIDs array as a query parameter

    // Execute the query using the MySQL connection pool
    pool.query(query, queryParams, (error, results) => {
      if (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
      } else {
        res.status(200).json(results); // Send the rows as JSON response
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//fetch count of chapter (opted by user) of multiple emails.
router.get('/fetch/courses/multiple', (req, res) => {
  // Get the string from the frontend
  const emailString = req.query.emails;

  // Split the string into an array of email IDs
  const emailArray = emailString.split(',');

  // Fetch the count of chapter_name for each email ID
  const query = `SELECT email, COUNT(chapter_name) AS count FROM student_course WHERE email IN (?) GROUP BY email`;
  pool.query(query, [emailArray], (error, results) => {
    if (error) {
      console.error('Error executing MySQL query:', error);
      res.status(500).json({ error: 'Internal Server Error' });
      return;
    }
    console.log("email count sent for courses");
    res.status(200).json(results);
  });
});


//route for uplaoding the ebook
router.post('/upload/ebook',ncertupload.single('pdf'),async (req,res)=>{
  const { className, subject_name } = req.body;
  const pdfFileName = req.file.originalname;

  console.log(className,subject_name,pdfFileName);

  // Store data in the database
  const insertQuery = 'INSERT INTO `ncert_books` (class, subject_name, pdf_fileName) VALUES (?, ?, ?)';

  pool.query(insertQuery, [className, subject_name, pdfFileName], (err, result) => {
    if (err) {
      console.error('Error inserting data into database:', err);
      return res.status(500).json({ error: 'Failed to insert data into database' });
    }

    res.status(200).json({ message: 'Data and file uploaded successfully' });
  });
})





// router for sending the ncert book data
router.get('/api/ncert-books',upload.none(),async (req,res)=>{
  try{
    pool.query('SELECT * FROM ncert_books',(error,results)=>{
      if(error){
        console.log(error);
        res.status(500).json({message:'Failed to fetch NCERT books' });
      }
      res.status(200).json(results);
    })
  }catch(e){
    console.log(e);
    res.status(500).json({message: 'Internal server error'});
  };
})


//router.use(express.static(path.join('/home/pygau14-2/Documents/ICI/ICI_backend/ICI_main/', 'src', 'NCERT')));
router.get('/pdf/:fileName',upload.none(), (req, res)=>{
  const filename = req.params.fileName;
  const filePath = path.resolve(process.cwd(), '..', 'NCERT', filename);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      console.error(err);
      res.status(404).send('File not found');
      return;
    }

    // Setting the response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    // Sending the PDF data as the response
    res.send(data);
  });
  
})

router.get('/chapters',upload.none(),async (req,res)=>{
   const className  = req.query.class;
   const subject_name = req.query.subject;
 

  try{
    pool.query(`SELECT chapter_name FROM class_questionSet WHERE class = '${className}' AND subject_name = '${subject_name}'`,(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal Server Error'});
      }
      else {

        const chapters = results.map(result => result.chapter_name);
        res.status(200).json(chapters);
      }
    });


  }catch{
    console.log('Error - outside catch');
  }

});

router.get('/topics',upload.none(), async(req,res)=>{
  const className  = req.query.class;
  const subject_name  = req.query.subject;
  const chapter_name = req.query.chapter;

  try{
    pool.query(`SELECT topic_name FROM class_questionSet WHERE class = '${className}' AND subject_name = '${subject_name}' AND chapter_name = '${chapter_name}' `,(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal Server Error'});
      }
      else {
        const topics = results.map(result => result.topic_name);
        res.status(200).json(topics);
      }
    });


  }catch{
    console.log('Error - outside catch');
  }
  
});

router.get('/questions',upload.none(),async (req,res)=>{
  const className  = req.query.class;
  const subject_name  = req.query.subject;
  const chapter_name = req.query.chapter;
  const topic_name  = req.query.topic;


  try{
    pool.query(`SELECT question_set FROM class_questionSet WHERE class = '${className}' AND subject_name = '${subject_name}' AND chapter_name = '${chapter_name}' AND topic_name = '${topic_name}'`,(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal Server Error'});
      }
      else {
        const questions = results.map(result => result.question_set);
        res.status(200).json(questions);
      }
    });


  }catch{
    console.log('Error - outside catch');
  }

});

router.get('/question-paper',upload.none(), async (req,res)=>{
  const questionSets = req.query.questionSet;
  console.log(questionSets);

  const setCode  = questionSets.split('_')[1];

  const tableName  = 'question_set'+setCode;

  const query = `SELECT * FROM ${tableName}`;

  try {
    pool.query(query , (err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message : 'Intenal server error'});
      }
      console.log(results);
      res.status(200).json(results);
    })
  }catch{
    console.log(error);
    res.status(500).json({message : 'Intenal server error'});
  }

});


router.get('/question-test',upload.none(),async (req,res)=>{
  try {
    pool.query('SELECT * FROM question_setB',(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message : 'Internal server Error'});
      }
      res.status(200).json(results);
    })
  }catch{
    console.log('Error');
    res.status(401).json({message : 'Internal server Error'});
  }
});

router.get('/api/totalStudents',upload.none(),async (req,res)=>{
  try {
    pool.query('SELECT * FROM users',(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal server Error'});
      }
      console.log(results);
      res.status(200).json(results);
    })
  }catch{
    console.log('Error');
    res.status(500).json({message:'Internal server Error'});
  }
});

// Route to fetch paid students
router.get('/api/paidStudents', (req, res) => {
  pool.query('SELECT * FROM paid_users', (err, results) => {
    if (err) {
      console.error('Error fetching paid students:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(200).json(results);
    }
  });
});

// Route to fetch total questions
router.get('/api/totalTests', (req, res) => {
  const query = "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'question_%'";

  pool.query(query, (err, result) => {
    if (err) {
      console.error('Error fetching table names:', err);
      res.status(500).json({ error: 'An error occurred' });
      return;
    }

    const tables = result.map(row => row.TABLE_NAME);

    const promises = tables.map(table => {
      return new Promise((resolve, reject) => {
        const countQuery = `SELECT COUNT(*) AS total FROM ${table}`;

        pool.query(countQuery, (err, result) => {
          if (err) {
            console.error(`Error fetching total questions from ${table}:`, err);
            reject(err);
          } else {
            resolve(result[0].total);
          }
        });
      });
    });

    Promise.all(promises)
      .then(results => {
        const total = results.reduce((sum, count) => sum + count, 0);
        console.log(total);
        res.status(200).json({ total });
      })
      .catch(error => {
        console.error('Error fetching total questions:', error);
        res.status(500).json({ error: 'An error occurred' });
      });
  });
});

router.post('/admin/add-student',upload.none(),async (req,res)=>{
  const {name , email , password , mobile_no,doj} = req.body;

  const hashedPassword  = await bcrypt.hash(password,10);

  try{
    pool.query('INSERT INTO users (name, email, mobile_no, password,doj) VALUES (?, ?, ?, ?,?)',[name , email,mobile_no, hashedPassword,doj],(err,results)=>{
      if(err){
        console.log('Error');
        res.status(500).json({message:'Internal Server Error'});
      }
      res.status(200).json({message : 'Data Inserted succesfully'});
      console.log('Data Inserted succesfully')
    })
  }catch{
    console.log('Error');
    res.status(500).json({message:'Internal Server Error'});
  }
});


router.post('/addquestionTest',upload.none(),async (req,res)=>{
  const {className , subject_name , chapter_name, topic_name , duration , full_marks,pass_marks, minus_marks , instruction} = req.body;
  console.log(className , subject_name , chapter_name, topic_name , duration , full_marks,pass_marks, minus_marks , instruction);
  try{
    pool.query('INSERT INTO test_description (class , subject_name, chapter_name , topic_name , full_marks , pass_marks , minus_marks , duration , Instructions ) VALUES (?,?,?,?,?,?,?,?,?)',[className , subject_name , chapter_name, topic_name ,full_marks,pass_marks, minus_marks , duration , instruction ],(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal Server Error'});
      }
      else {
        console.log('Data Inserted succesfully');
       
      const query = `SELECT test_id FROM test_description WHERE class = '${className}' AND subject_name = '${subject_name}' AND chapter_name = '${chapter_name}' AND topic_name = '${topic_name}' AND full_marks = '${full_marks}' AND pass_marks = '${pass_marks}' AND minus_marks = '${minus_marks}' AND duration = '${duration}' AND Instructions = '${instruction}' `;
      pool.query(query,(error,result)=>{
        if(error){
          console.log(error);

        }
        console.log(result);
        res.status(200).json({message : 'data inserted sucessfully' ,data : result[0].test_id});
      })
      }
    })
  }catch{
    console.log('Error');
    res.status(500).json({message:'Internal Server Error'});
  }
});

// API endpoint to receive selected questions from frontend and save them in the database
router.post('/save-selected-questions',upload.none(), async (req, res) => {
  const testId = req.body.test_id;
  const selectedQuestions = req.body.questions;
  const status = req.body.status;

  let tableName ="";
  if(status === 'save'){
    tableName = 'save_test_'+testId;
  }else{
    tableName = "test_"+testId;
  }

  // Create the table with the name "test_test_id"
  const createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_no INT,
    question TEXT,
    option1 TEXT,
    option2 TEXT,
    option3 TEXT,
    option4 TEXT,
    correctOption TEXT,
    image_url TEXT,
    tags TEXT
  )`;

  pool.query(createTableQuery, (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: 'Failed to create table' });
    } else {
      // Insert the selected questions into the table
      const insertQuery = `INSERT INTO ${tableName} (question_no, question, option1, option2, option3, option4, correctOption, image_url, tags) VALUES ?`;

      // Prepare the values for insertion
      const values = selectedQuestions.map((question) => [
        question.question_no,
        question.question,
        question.option1,
        question.option2,
        question.option3,
        question.option4,
        question.correctOption,
        question.image_url,
        question.Tags,
      ]);

      pool.query(insertQuery, [values], (err, result) => {
        if (err) {
          console.error(err);
          res.status(500).json({ message: 'Failed to insert questions into table' });
        } else {
          pool.query('UPDATE test_description SET status = ? WHERE test_id = ?',[status,testId],(err,result)=>{
            if(err){
              console.error(err);
              res.status(500).json({ message: 'Failed to  update status' });
            }else{
              res.status(200).json({message : 'Test is created Sucessfully'});
            }
          });
        }
      });
    }
  });
});

//route to fetch test by class and subject

router.get('/test/details/student', (req, res) => {
  const className = req.query.className;
  const subjectName = req.query.subjectName;
  console.log(className,subjectName);

  // Construct the SQL query
  const query = `SELECT * FROM test_description WHERE class = ? AND subject_name = ? AND status = 'publish'`;

  // Execute the query
  pool.query(query, [className, subjectName], (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      res.status(500).json({ error: 'An error occurred while fetching the columns.' });
    } else {
      res.status(200).json(results);
    }
  });
});
//route to fetch the test_description  using test_id
router.get('/test/description', (req, res) => {
  const test_id = req.query.test_id;
  // Construct the SQL query
  const query = `SELECT * FROM test_description WHERE test_id = ? AND status = 'publish'`;

  // Execute the query
  pool.query(query, [test_id], (error, results) => {
    if (error) {
      console.error('Error executing query:', error);
      res.status(500).json({ error: 'An error occurred while fetching the columns.' });
    } else {
      res.status(200).json(results);
    }
  });
});


// Route to fetch total test
router.get('/test', (req, res) => {
  const className = req.query.class;
  const subject_name  = req.query.subject;
  const chapter_name  = req.query.chapter;
  const topic_name  = req.query.topic;
  console.log(className,subject_name,chapter_name,topic_name);
  pool.query('SELECT * FROM test_description WHERE class = ? AND subject_name = ? AND topic_name = ? AND chapter_name = ? AND status=?',[className, subject_name,topic_name,chapter_name,'publish'], (err, results) => {
    if (err) {
      console.error('Error fetching total questions:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      console.log('test descriptions extracted and sended sucessfully');
      console.log(results);
      res.status(200).json(results);
    }
  });
});

//route to get test questions
router.get('/fetch/test-questions',upload.none(),(req,res)=>{
  const test_id = req.query.test_id;
  const table_name  = "test_"+test_id;
  pool.query('SELECT * FROM '+table_name,(err,result)=>{
    if(err){
      console.log(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }else{
      res.status(200).json(result);
    }
  })
});




// Route to fetch total test
router.get('/save-test', (req, res) => {
  const className = req.query.class;
  const subject_name  = req.query.subject;
  const chapter_name  = req.query.chapter;
  const topic_name  = req.query.topic;
  console.log(className,subject_name,chapter_name,topic_name);
  pool.query('SELECT * FROM test_description WHERE class = ? AND subject_name = ? AND topic_name = ? AND chapter_name = ? AND status=?',[className, subject_name,topic_name,chapter_name,'save'], (err, results) => {
    if (err) {
      console.error('Error fetching total questions:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      console.log('test descriptions extracted and sended sucessfully');
      console.log(results);
      res.status(200).json(results);
    }
  });
});

//route to get test questions
router.get('/fetch/save-test-questions',upload.none(),(req,res)=>{
  const test_id = req.query.test_id;
  const table_name  = "save_test_"+test_id;
  pool.query('SELECT * FROM '+table_name,(err,result)=>{
    if(err){
      console.log(err);
      res.status(500).json({ error: 'Internal Server Error' });
    }else{
      res.status(200).json(result);
    }
  })
});

//route to store user test results
router.post('/user-tests',upload.none(), (req, res) => {
  // Extract the data from the request body
  const {
    user_id,
    test_id,
    selectedOptions,
    questionAttempted,
    score,
    wrongAnswersNo,
    totalQuestions
  } = req.body;

  // Define the SQL query to insert data into the "user_test" table
  const sql = `
    INSERT INTO user_test (user_id, test_id, selectedOptions, questionAttempted, score, wrongAnswersNo, totalQuestions)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  // Execute the query with the provided data
  pool.query(sql, [user_id, test_id, selectedOptions, questionAttempted, score, wrongAnswersNo, totalQuestions], (error, results) => {
    if (error) {
      console.error('Error inserting data:', error);
      res.status(500).json({ message: 'Error inserting data' });
    } else {
      console.log('Data inserted successfully');
      res.status(200).json({ message: 'Data inserted successfully' });
    }
  });
});


//route to fetch user test info
router.get('/fetch/user/test', (req, res) => {
  // Extract the user_id from the query parameter
  const { user_id } = req.query;

  // Define the SQL query to fetch data from the "user_test" table
  const sql = `
    SELECT * FROM user_test WHERE user_id = ?
  `;

  // Execute the query with the provided user_id
  pool.query(sql, [user_id], (error, results) => {
    if (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ message: 'Error fetching data' });
    } else {
      console.log('Data fetched successfully');
      res.json(results);
    }
  });
});


//route to fetch all user test records for leaderboard
router.get('/fetch/all-user', (req, res) => {
  

  // Define the SQL query to fetch data from the "user_test" table
  const sql = `
    SELECT * FROM user_test
  `;

  // Execute the query with the provided user_id
  pool.query(sql,(error, results) => {
    if (error) {
      console.error('Error fetching data:', error);
      res.status(500).json({ message: 'Error fetching data' });
    } else {
      console.log('All users Data fetched successfully for leaderboard');
      res.status(200).json(results);
    }
  });
});



router.post('/upload-csv', upload.fields([{ name: 'file1' }, { name: 'file2' }]), function(req, res) {
  const file1 = req.files['file1'][0];
  const file2 = req.files['file2'][0];
  
  // Process CSV file 1
  fs.createReadStream(file1.path)
    .pipe(csv())
    .on('data', function(row) {
      // Check conditions in database table class_questionSet
      const query = 'SELECT * FROM class_questionSet WHERE class = ? AND subject_name = ? AND chapter_name = ? AND topic_name = ?';
      const values = [row.class, row.subject_name, row.chapter_name, row.topic_name];
      pool.query(query, values, function(error, results) {
        if (error) {
          console.error(error);
          res.status(500).json({ message: 'An error occurred while checking conditions' });
        } else {
          if (results.length === 0) {
            // Insert row into table class_questionSet
            const insertQuery = 'INSERT INTO class_questionSet (class, subject_name, chapter_name, topic_name, question_set) VALUES (?, ?, ?, ?, ?)';
            const insertValues = [row.class, row.subject_name, row.chapter_name, row.topic_name, row.question_set];
            
            pool.query(insertQuery, insertValues, function(insertError) {
              if (insertError) {
                console.error(insertError);
              }
            });
          }
        }
      });
    })
    .on('end', function() {
      // Process CSV file 2
      fs.createReadStream(file2.path)
        .pipe(csv())
        .on('data', function(row) {
          const tableName = 'question_set' + row.question_set;
          
          // Check if table exists
          const checkTableQuery = "SHOW TABLES LIKE ?";
          const checkTableValues = [tableName];
          
          pool.query(checkTableQuery, checkTableValues, function(checkError, checkResults) {
            if (checkError) {
              console.error(checkError);
              res.status(500).json({ message: 'An error occurred while checking table existence' });
            } else {
              if (checkResults.length === 0) {
                // Create table with the tableName
                const createTableQuery = "CREATE TABLE ?? (id INT AUTO_INCREMENT PRIMARY KEY, question VARCHAR(255), option1 VARCHAR(255), option2 VARCHAR(255), option3 VARCHAR(255), option4 VARCHAR(255), correctOption VARCHAR(255), image_url VARCHAR(255), tags VARCHAR(255))";
                const createTableValues = [tableName];
                
                pool.query(createTableQuery, createTableValues, function(createError) {
                  if (createError) {
                    console.error(createError);
                  }
                });
              }
              
              // Insert data into the table
              const insertDataQuery = "INSERT INTO ?? (question, option1, option2, option3, option4, correctOption, image_url, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
              const insertDataValues = [tableName, row.question, row.option1, row.option2, row.option3, row.option4, row.correctOption, row.image_url, row.tags];
              
              pool.query(insertDataQuery, insertDataValues, function(insertDataError) {
                if (insertDataError) {
                  console.error(insertDataError);
                }
              });
            }
          });
        })
        .on('end', function() {
          res.json({ message: 'CSV files uploaded successfully' });
        });
    });
});

router.get('/testNumber',upload.none(), async (req,res)=>{
  const query = "SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'test_%'";

  pool.query(query, (err, result) => {
    if (err) {
      console.error('Error fetching total tests:', err);
      res.status(500).json({ error: 'An error occurred' });
      return;
    }

    const total = result[0].total;
    console.log(total)
    res.json({ total });
  });
})


module.exports =router; 
