const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  bio: String,
  skills: [String],
  avatar: String,
});

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);