const express = require('express');
const router = express.Router();
// jwt token for auth
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const multer = require('multer');
const pool = require('./db');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');


const storage = multer.memoryStorage();
const upload = multer({storage : storage});

//sign up route
router.post('/signup',upload.single('profile_picture'), async(req,res)=>{
  const {name, email , password , mobile_no, dob , country , state , city , street_address , school_name, institute_name , courses , subjects } = req.body;
  const profile_picture = req.file ? req.file.buffer : null ;


  // if (password !== confirmPassword){
  //   return res.status(400).json({message : 'Password do not match'});
  // }

  const hashedPassword  = await bcrypt.hash(password,10);

  try {
    try {
      await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',[name, email , hashedPassword],(error,result)=>{
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


router.get('/subjects/:class',upload.none(),async (req,res)=>{
  const selectedClass = req.params.class;
  const client = await pool.connect();

  client.query('SELECT subjects_list FROM classes_sub WHERE class=$1',[selectedClass],(error,results)=>{
    if(error){
      console.error(error);
      res.status(500).json({message :'Internal Server Error'});
    }
    else {
      const subjectsArr = results.rows[0].subjects_list;
      const subjects_list = subjectsArr.map(subject=>subject.trim());
      res.status(200).json(subjects_list);
      client.release();
    }
  });

});


router.get('/chapters/:class/:subject_name',async (req,res)=>{
  const selectedClass = req.params.class;
  const subject_name = req.params.subject_name;
  const client = await pool.connect();

  client.query('SELECT chapters_list FROM class_sub_chapter WHERE class = $1 AND subject_name = $2',[selectedClass,subject_name],(error,results)=>{
    if(error){
      console.error(error);
      res.status(400).json({message : 'Internal Server Error'});
    }
    else{
      const chaptersArr = results.rows[0].chapters_list;
      const chapters_list = chaptersArr.map(chapter=>chapter.trim());
      res.status(200).json(chapters_list);
    }
  });
});

router.get('/topics/:class/:chapter_name',async(req,res)=>{
  console.log('running 3rd gate');
  const selectedClass = req.params.class;
  const chapter_name = req.params.chapter_name;
  const client = await pool.connect();

  client.query('SELECT topics_list FROM class_chap_topic WHERE class = $1 AND chapter_name = $2',[selectedClass,chapter_name],(error,results)=>{
    if(error){
      console.error(error);
      res.status(400).json({message : 'Internal server error'});
    }
    else{
      const topicsArr = results.rows[0].topics_list;
      const topics_list = topicsArr.map(topic=>topic.trim())
      res.status(200).json(topics_list);
    }
  })
})


router.get('/api/courses',async (req,res)=>{
  try{
    // Query the popular_courses table for courses with ratings 4 and 5
    
    pool.query('SELECT class, subject_name, chapter_name, topic_name, course_url, rating FROM popular2',(err,results)=>{
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
})


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

router.get('api/totalStudents',upload.none(),async (req,res)=>{
  try {
    pool.query('SEELCT * FROM users',(err,results)=>{
      if(err){
        console.log(err);
        res.status(500).json({message:'Internal server Error'});
      }
      res.status(200).json(results);
    })
  }catch{
    console.log('Error');
    res.status(500).json({message:'Internal server Error'});
  }
});

// Route to fetch paid students
app.get('/api/paidStudents', (req, res) => {
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
app.get('/api/totalQuestions', (req, res) => {
  pool.query('SELECT COUNT(*) AS totalQuestions FROM class_questionSet', (err, results) => {
    if (err) {
      console.error('Error fetching total questions:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    } else {
      res.status(200).json({ totalQuestions: results[0].totalQuestions });
    }
  });
});
 

module.exports =router; 
