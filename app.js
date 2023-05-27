const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());


const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//API-1

app.post("/register/", async (request, response)=>{
    const {username, password, name, gender} = request.body;
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    const selectUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}'
        `;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined){
        if ((password.length) < 6){
            response.status(400);
            response.send("Password is too short");
        }else{
            const createUserQuery = `
                INSERT INTO
                    user (name, username, password, gender)
                VALUES(
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}'
                )
            `;
            await db.run(createUserQuery);
            response.status(200);
            response.send("User created successfully");
        }
    }else{
        response.status(400);
        response.send("User already exists");
    }
});

//API-2

app.post("/login/", async (request, response)=>{
    const {username, password} = request.body;
    const selectUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';
    `;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined){
        response.status(400);
        response.send("Invalid user");
    }else{
        const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
        if (isPasswordMatched === true){
            const payload = {
                username: username,
            };
            const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
            response.send({ jwtToken });
        }else{
            response.status(400);
            response.send("Invalid password");
        }
    }
});



//API-3

app.get("/user/tweets/feed", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id = 4, name, username, gender } = payload;
  const getTweetsFeedQuery = `
        SELECT 
            username,
            tweet,
            date_time AS dateTime
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}
        ORDER BY
            date_time DESC
        LIMIT 4    
            ;`;

  const tweetFeedArray = await db.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//API-4

app.get("/user/following/", authenticateToken, async (request,response)=>{
    const { payload } = request;
    const { user_id = 4, name, username, gender} = payload;
    const getUserFollowQuery = `
        SELECT
            name
        FROM
            user INNER JOIN follower ON user.user_id = follower.following_user_id 
        WHERE
            follower.follower_user_id = ${user_id};
    `;
    const userFollowsArray = await db.all(getUserFollowQuery);
    response.send(userFollowsArray);
});

//API-5

app.get("/user/followers", authenticateToken, async (request, response)=>{
    const { payload } = request;
    const { user_id = 4, name, username, gender } = payload;
    const getUserFollowersQuery = `
        SELECT
            name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.follower_user_id 
        WHERE
            follower.following_user_id = ${user_id};
    `;
    const userFollowersArray = await db.all(getUserFollowersQuery);
    response.send(userFollowersArray);
});

//API-6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response)=>{
    const { tweetId } = request.params;
    const { payload } = request;

    const { user_id = 4, name, username, gender } = payload;
    const getTweetsQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`;
    const tweetsResult = await db.get(getTweetsQuery);

    const getFollowersQuery = `
        SELECT
            *
        FROM 
            follower INNER JOIN user On user.user_id = follower.following_user_id
        WHERE
            follower.follower_user_id = ${user_id};
    `;
    const followersResult = await db.all(getFollowersQuery);

    if (
      followersResult.some(
        (item) => item.following_user_id === tweetsResult.user_id
    )
    ){
    const getTweetDetailsQuery = `
            SELECT
                tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                tweet.tweet_id = ${tweetId} AND tweet.user_id=${followersResult[0].user_id}
            ;`;

    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//API-7

app.get("/tweets/:tweetId/likes/", authenticateToken, async (request, response)=>{
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id = 4, name, username, gender } = payload;

    const getLikedUsersQuery = `
        SELECT
            *
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
            INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN user ON 
            user.user_id = like.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;

    const likedUsers = await db.all(getLikedUsersQuery);

    if (likedUsers.length !== 0){
        let likes = []
        const getNamesArray = (likedUsers) => {
            for (let item of likedUsers){
                likes.push(item.username)
            }
        };
        getNamesArray(likedUsers);
        response.send({likes});
    }else{
        response.status(401);
        response.send("Invalid Request");
    }
});

//API-8

app.get("/tweets/:tweetId/replies/", authenticateToken, async (request, response)=>{
    const { tweetId } = request.params;
    const { payload } = request;
    const { user_id = 4, name, username, gender} = payload;
    const getRepliesUserQuery = `
        SELECT        
            *
        FROM
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id
            INNER JOIN reply ON reply.tweet_id = tweet.tweet_id INNER JOIN user ON 
            user.user_id = reply.user_id
        WHERE
            tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};
    `;

    const repliesUser = await db.all(getRepliesUserQuery);

    if (repliesUser.length !== 0){
        let replies = [] 
        const getNameAndRepliesArray = (repliesUser) =>{
            for (let item of repliesUser){
                let object = {
                    name : item.name,
                    reply : item.reply,
                }
                replies.push(object);
            }
        };
        getNameAndRepliesArray(repliesUser);
        response.send({replies});
    }else{
        response.status(401);
        response.send("Invalid Request");
    }
});

//API-9

app.get("/user/tweets/", authenticateToken, async (request, response)=>{
    const { payload } = request;
    const { user_id = 4, name, username, gender } = request;
    const getTweetDetailsQuery = `
        SELECT
            tweet,
            COUNT(DISTINCT(like.like_id)) AS likes,
            COUNT(DISTINCT(reply.reply_id)) AS replies,
            tweet.date_time AS dateTime
        FROM
            tweet INNER JOIN user ON tweet.user_id = user.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id 
        WHERE
            user.user_id = ${user_id}
        GROUP BY 
            tweet.tweet_id;            
    `;
    const tweetDetails = await db.all(getTweetDetailsQuery);
    response.send(tweetDetails);
});

//API-10

app.post("/user/tweets/", authenticateToken, async (request, response)=>{
    const { tweet } = request.body;
    const { payload } = request;
    const { user_id = 4, name, username, gender } = payload;
    const createTweet = `
        INSERT INTO
            tweet( tweet, user_id )
        VALUES(
            '${tweet}',
            ${user_id}
        ); 
    `;
    await db.run(createTweet);
    response.send("Created a Tweet");
});

//API-11

app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id = 4, name, username, gender } = payload;

  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweetUser = await db.all(selectUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE 
            tweet.user_id =${user_id} AND tweet.tweet_id =${tweetId}
    ;`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;

