import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {User,Notice,Event,Assignment,initIndexes} from './models.js';
if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12)throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD (12+ characters) in .env.');
if(process.env.DEMO_PASSWORD&&(process.env.DEMO_PASSWORD.length<12||process.env.NODE_ENV==='production'))throw new Error('DEMO_PASSWORD requires development mode and at least 12 characters.');
for(const key of ['ADMIN_PASSWORD','DEMO_PASSWORD'])if(process.env[key]&&Buffer.byteLength(process.env[key],'utf8')>72)throw new Error(key+' must be at most 72 UTF-8 bytes.');
await mongoose.connect(process.env.MONGODB_URI);await initIndexes();
async function account(name,email,role,password){return User.findOneAndUpdate({email},{$setOnInsert:{name,email,role,password:await bcrypt.hash(password,12)}},{upsert:true,new:true});}
const admin=await account('Campus Administrator',process.env.ADMIN_EMAIL.toLowerCase(),'admin',process.env.ADMIN_PASSWORD);
if(process.env.DEMO_PASSWORD){await account('Dr. Meera Sharma','faculty@college.test','faculty',process.env.DEMO_PASSWORD);await account('Aarav Singh','student@college.test','student',process.env.DEMO_PASSWORD);}
if(!await Notice.countDocuments())await Notice.insertMany([{title:'Welcome to your connected campus',body:'Your notices, assignments, events and support requests now live in one place. Complete your profile to get started.',author:admin._id},{title:'Library extended hours',body:'The central library remains open until 10 PM during assessment week. Carry your student identity card.',author:admin._id}]);
if(!await Event.countDocuments())await Event.create({title:'Build Together: Campus Hackathon',description:'A weekend of ideas, teamwork and working prototypes. Open to all departments.',location:'Innovation Hub, Block C',date:new Date(Date.now()+14*86400000),capacity:120,author:admin._id});
if(!await Assignment.countDocuments())await Assignment.create({title:'Web Technology: Responsive Portfolio',description:'Build an accessible portfolio with HTML, CSS, Bootstrap and JavaScript. Submit your project report as a PDF.',due:new Date(Date.now()+7*86400000),author:admin._id});
console.log('Seed complete. Existing accounts and passwords were not overwritten.');
await mongoose.disconnect();
