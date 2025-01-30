// Requirements and importing packages needed for the project
require("dotenv").config();
const jwt = require("jsonwebtoken");
const sanitizeHTML = require("sanitize-html");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const express = require("express");
const db = require("better-sqlite3")("ourApp.db");
db.pragma("journal_mode = WAL");

// Create table of users/passwords in database.
const createTables = db.transaction(() => {
  db.prepare(
    `
        CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username STRING NOT NULL UNIQUE,
        password STRING NOT NULL
        )
        `
  ).run();

  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdDate TEXT,
      title STRING NOT NULL,
      body TEXT NOT NULL,
      authorid INTEGER,
      FOREIGN KEY (authorid) REFERENCES users(id)
      )
      `
  ).run();
});
createTables();

// basic code to start server
const app = express();

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(cookieParser());

// Creates cookies if needed to store information of login
app.use(function (req, res, next) {
  res.locals.errors = [];

  try {
    const decoded = jwt.verify(req.cookies.ourSimpleApp, process.env.JWTSECRET);
    req.user = decoded;
  } catch (err) {
    req.user = false;
  }

  res.locals.user = req.user;
  console.log(req.user);

  next();
});

// first thing that renders when entering the site
app.get("/", (req, res) => {
  if (req.user) {
    return res.render("dashboard");
  }
  res.render("homepage");
});

// render login page
app.get("/login", (req, res) => {
  res.render("login");
});

// when logout, removes the cookie which stores info on the users logged and redirects to homepage
app.get("/logout", (req, res) => {
  res.clearCookie("ourSimpleApp");
  res.redirect("/");
});

// validates and sends login form info to the databse
app.post("/login", (req, res) => {
  let errors = [];
  // text on username/password field is not a string, transform it to a empty string.
  if (typeof req.body.username !== "string") req.body.username = "";
  if (typeof req.body.password !== "string") req.body.password = "";

  // check if it's empty
  if (req.body.username.trim() == "") errors = ["Invalid username / password."];
  if (req.body.password == "") errors = ["Invalid username / password."];

  if (errors.length) {
    return res.render("login", { errors });
  }

  // checks if username exists in database
  const userInQuestionStatement = db.prepare(
    "SELECT * FROM users WHERE USERNAME = ?"
  );
  const userInQuestion = userInQuestionStatement.get(req.body.username);

  if (!userInQuestion) {
    errors = ["Invalid username / password."];
    return res.render("login", { errors });
  }

  // decrypts password in database using bcrypt package and checks if matches with user input
  const matchOrNot = bcrypt.compareSync(
    req.body.password,
    userInQuestion.password
  );
  if (!matchOrNot) {
    errors = ["Invalid username / password."];
    return res.render("login", { errors });
  }

  // if matches, creates a cookie to store that user is logged in
  const ourTokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000 + 60 * 60 * 24),
      userid: userInQuestion.id,
      username: userInQuestion.username,
    },
    process.env.JWTSECRET
  );

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.redirect("/");
});

// redirects user to initial page if he tries to acess must-login pages
function mustBeLoggedIn(req, res, next) {
  if (req.user) {
    return next();
  }
  return res.redirect("/");
}

app.get("/create-post", mustBeLoggedIn, (req, res) => {
  res.render("create-post");
});

function sharedPostValidation(req) {
  const errors = [];

  if (typeof req.body.title !== "string") req.body.title = "";
  if (typeof req.body.body !== "string") req.body.body = "";

  req,
    (body.title = sanitizeHTML(req.body.title.trim(), {
      allowedTags: [],
      allowedAttributes: {},
    }));
  req,
    (body.body = sanitizeHTML(req.body.body.trim(), {
      allowedTags: [],
      allowedAttributes: {},
    }));

  if (!req.body.tile) errors.push("You must provide a title.");
  if (!req.body.body) errors.push("You must provide content.");

  return errors;
}

app.post("/create-post", (req, res) => {
  const errors = sharedPostValidation(req);

  if (errors.length) {
    return res.render("create-post", { errors });
  }

  // save post in database
});

app.post("/register", (req, res) => {
  const errors = [];
  if (typeof req.body.username !== "string") req.body.username = "";
  if (typeof req.body.password !== "string") req.body.password = "";

  req.body.username = req.body.username.trim();

  if (!req.body.username) errors.push("You must provide a username");
  if (req.body.username && req.body.username.length < 3)
    errors.push("Username must be at least 3 characters.");
  if (req.body.username && req.body.username.length > 10)
    errors.push("Username cannot exceed 10 characters.");
  if (req.body.username && !req.body.username.match(/^[a-zA-Z0-9]+$/))
    errors.push("Username can only contain letters and numbers.");

  const usernameStatement = db.prepare(
    "SELECT * FROM users WHERE username = ?"
  );
  const usernameCheck = usernameStatement.get(req.body.username);

  if (usernameCheck) errors.push("Username already taken.");

  if (!req.body.password) errors.push("You must provide a password.");
  if (req.body.password && req.body.password.length < 3)
    errors.push("Password must be at least 3 characters.");
  if (req.body.password && req.body.password.length > 10)
    errors.push("Password cannot exceed 10 characters.");

  if (errors.length) {
    return res.render("homepage", { errors });
  }
  const salt = bcrypt.genSaltSync(10);
  req.body.password = bcrypt.hashSync(req.body.password, salt);

  const ourStatement = db.prepare(
    "INSERT INTO users (username, password) VALUES (?, ?)"
  );
  const result = ourStatement.run(req.body.username, req.body.password);

  const lookupStatement = db.prepare("SELECT * FROM users WHERE ROWID = ?");
  const ourUser = lookupStatement.get(result.lastInsertRowid);

  const ourTokenValue = jwt.sign(
    {
      exp: Math.floor(Date.now() / 1000 + 60 * 60 * 24),
      userid: ourUser.id,
      username: ourUser.username,
    },
    process.env.JWTSECRET
  );

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  });

  res.redirect("/");
});

app.listen(3000);
