import mongoose from 'mongoose';
const {Schema,model}=mongoose;
const ref=(name)=>({type:Schema.Types.ObjectId,ref:name,required:true});
const options={timestamps:true};
const userSchema=new Schema({name:{type:String,required:true,maxlength:80},email:{type:String,required:true,unique:true,lowercase:true},password:{type:String,required:true,select:false},role:{type:String,enum:['student','faculty','admin'],default:'student'},branch:{type:String,default:''},resume:{type:String,select:false}},options);
const noticeSchema=new Schema({title:{type:String,required:true},body:{type:String,required:true},author:ref('User')},options);
const eventSchema=new Schema({title:{type:String,required:true},description:{type:String,required:true},location:{type:String,required:true},date:{type:Date,required:true},capacity:{type:Number,required:true},author:ref('User')},options);
// Registration is an atomic seat counter on Event; the unique pair prevents duplicate joins.
eventSchema.add({registered:{type:Number,default:0}});
const registrationSchema=new Schema({event:ref('Event'),student:ref('User')},options);
registrationSchema.index({event:1,student:1},{unique:true});
const assignmentSchema=new Schema({title:{type:String,required:true},description:{type:String,required:true},due:{type:Date,required:true},author:ref('User')},options);
const submissionSchema=new Schema({assignment:ref('Assignment'),student:ref('User'),file:{type:String,required:true}},options);
submissionSchema.index({assignment:1,student:1},{unique:true});
const complaintSchema=new Schema({title:{type:String,required:true},description:{type:String,required:true},category:{type:String,enum:['Academic','Hostel','IT','Facilities'],required:true},status:{type:String,enum:['Open','In Progress','Resolved'],default:'Open'},student:ref('User')},options);
for(const schema of [noticeSchema,eventSchema,assignmentSchema,complaintSchema])schema.index({createdAt:-1,_id:-1});
complaintSchema.index({student:1,createdAt:-1});
export const User=model('User',userSchema);
export const Notice=model('Notice',noticeSchema);
export const Event=model('Event',eventSchema);
export const Registration=model('Registration',registrationSchema);
export const Assignment=model('Assignment',assignmentSchema);
export const Submission=model('Submission',submissionSchema);
export const Complaint=model('Complaint',complaintSchema);
export async function initIndexes(){for(const m of [User,Notice,Event,Registration,Assignment,Submission,Complaint])await m.init();}
