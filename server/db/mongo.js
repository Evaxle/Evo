const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');

let client;
let users;

async function init() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not provided');
  client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'evo');
  users = db.collection('users');
  await users.createIndex({ email: 1 }, { unique: true });
}

async function createUser({ email, password, name }) {
  const hashed = await bcrypt.hash(password, 10);
  const doc = { email, password: hashed, name: name || null, data: {} };
  const res = await users.insertOne(doc);
  return { id: res.insertedId.toString(), email, name: name || null };
}

async function findUserByEmail(email) {
  return await users.findOne({ email });
}

async function findUserById(id) {
  try {
    const _id = typeof id === 'string' ? new ObjectId(id) : id;
    return await users.findOne({ _id });
  } catch (err) {
    return null;
  }
}

async function verifyPassword(user, password) {
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}

async function updateUserData(id, data) {
  const _id = typeof id === 'string' ? new ObjectId(id) : id;
  await users.updateOne({ _id }, { $set: { data } });
  return data;
}

module.exports = { init, createUser, findUserByEmail, verifyPassword, findUserById, updateUserData };
