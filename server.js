import express from "express";
import http from "http";
import path from "path";
import {fileURLToPath} from "url";
import {Server} from "socket.io";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});

app.use(express.static(path.join(__dirname,"public")));
app.use((req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

const rooms=new Map();
const code=()=>Math.random().toString(36).slice(2,6).toUpperCase()+"-"+Math.random().toString(36).slice(2,6).toUpperCase();

io.on("connection",s=>{
  s.on("create-room",({name="Visitante"}={},cb)=>{
    let c=code(); while(rooms.has(c)) c=code();
    rooms.set(c,{host:s.id,locked:true,users:new Map([[s.id,{name,role:"host"}]])});
    s.join(c); s.data.room=c; cb?.({ok:true,code:c});
  });

  s.on("join-room",({code:c,name="Visitante",key=""}={},cb)=>{
    c=String(c||"").toUpperCase();
    const r=rooms.get(c);
    if(!r)return cb?.({ok:false,error:"Sala não encontrada."});
    if(r.locked&&key!==c)return cb?.({ok:false,error:"Código incorreto."});
    r.users.set(s.id,{name,role:"viewer"}); s.join(c); s.data.room=c;
    const u=[...r.users].map(([id,v])=>({id,...v}));
    io.to(c).emit("room-users",u); io.to(r.host).emit("viewer-joined",{id:s.id});
    cb?.({ok:true,users:u});
  });

  s.on("set-locked",({locked})=>{
    const r=rooms.get(s.data.room);
    if(r?.host===s.id){r.locked=!!locked;io.to(r.host).emit("room-lock",r.locked);}
  });

  s.on("signal",({to,data})=>to&&io.to(to).emit("signal",{from:s.id,data}));
  s.on("streaming-state",({active})=>{
    const r=rooms.get(s.data.room);
    if(r?.host===s.id)io.to(s.data.room).emit("streaming-state",{active});
  });
  s.on("stop-stream",()=>{
    const r=rooms.get(s.data.room);
    if(r?.host===s.id)io.to(s.data.room).emit("stream-stopped");
  });
  s.on("disconnect",()=>{
    const c=s.data.room,r=rooms.get(c); if(!r)return;
    if(r.host===s.id){io.to(c).emit("host-left");rooms.delete(c)}
    else{r.users.delete(s.id);io.to(c).emit("room-users",[...r.users].map(([id,v])=>({id,...v})))}
  });
});

server.listen(process.env.PORT||3000,()=>console.log("Tela Ilhabela online"));