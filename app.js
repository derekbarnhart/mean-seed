
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path');

/**
 * Mongo DB setup
 */
var mongoose = require ("mongoose");

var uristring = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/DevMongo';

mongoose.connect(uristring, function (err, res) {
    if (err) {
        console.log ('ERROR connecting to: ' + uristring + '. ' + err);
    } else {
        console.log ('Successfully connected to: ' + uristring);
    }
});


/**
 * Redis setup
 */
var RedisStore = require('connect-redis')(express);
var redis = require('redis');
var url = require('url');

if (process.env.REDISCLOUD_URL) {
    var redisURL = url.parse(process.env.REDISCLOUD_URL);
    var client = redis.createClient(redisURL.port, redisURL.hostname, {no_ready_check: true});
    client.auth(redisURL.auth.split(":")[1]);
    console.log ('Connecting to Redis instance at: ' + redisURL);

} else {
    var client = redis.createClient();
    console.log ('Connecting to local Redis instance ');
}


/**
 * Authentication Setup
 */

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var User = require("./models/UserModel")

//Set up Authentication Middleware
passport.use(new LocalStrategy(
    function(username, password, done) {

        console.log(username + " " +password)

        User.findOne({username:username}, function(err,user){
            if(err){
                return done(err);
            }

            if(!user){
                return done(null, false, { message: 'Problem authenticating the user' });
            }
            //Test matching password
            user.comparePassword(password, function(err,isMatch){
                if(err) throw err;

                if(!isMatch){
                    return done(null, false, { message: 'Problem authentication the user' });

                    res.send({
                        success:true,
                        message: "Must provide a username and password",
                        user:user
                    })
                }else{
                    return done(null, user);
                }
            })
        })
    }
));

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});

//The actual middleware to place on the route
function authenticate(req, res, next) {
    if (req.isAuthenticated()) {
        console.dir(req.session.passport.user)
        req['sanitizedUser'] = {
            username: req.session.passport.user.username,
            id: req.session.passport.user.objectId
        };
        //Check for roles on the user object here
        return next(); }
    res.redirect('/login')
}


var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('6e6bc3e0-b3ae-4032-9186-994d7094385e'));
  app.use(express.session({
        secret: "f1774a1a-e5af-4d07-87ea-258a42478542",
        store: new RedisStore({client: client})
    }));
  app.use(passport.initialize()); //For authentication
  app.use(passport.session()); //For authentication
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'app')));
});

/**
 * Environmental configurations
 */
app.configure('development', function(){
  app.use(express.errorHandler());
});


/**
 * Route definitions
 */
// Open access routes
app.get('/', routes.index);

app.get('/entryPoint', routes.index); // Do any initial session setup here

// Authentication/User Management routes
//TODO Implement a get for login
app.post('/login', passport.authenticate('local', {successRedirect: '/entryPoint', failureRedirect: '/login' }));//A page to login syncronously

app.get('/logout',function(req,res){
    req.logout();
    res.redirect('/');
})

app.post('/logout',function(req,res){
    req.logout();
    res.redirect('/');
})

//TODO place this code into the 'user' modules
app.get('/user',function(req,res){

    User.find({}).exec(function(err, result) {
        if (!err) {
            res.send(result);
        } else {
            res.end('Error in first query. ' + err)
        };
    });
})

app.post('/user',function( req, res){

    if(!req.body.username || !req.body.password){
        res.send({success:false,message: "Must provide a username and password"})
        return;
    }

    User.findOne({username:req.body.username}, function(err,user){
        var newUser = new User(req.body);
        newUser.save(function( err, createdUser){
            if(err){
                if(err.code==11000){
                    res.send({success:false,message:"Username taken"})
                    return
                }
                res.send({success:false,message:"Could not create user"})
            }else{
                console.dir(createdUser)
                res.send({success:true,user:createdUser})
            }
        });
    });
})

// Protected routes

//Place authenticate in the argument list to protect route
//app.get('/protected',authenticate,routes.protected)

//TODO implement a role filtering system


http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
