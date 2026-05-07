import React, { useState } from 'react';
export default function App(){ const [goal,setGoal]=useState(''); return <div className='app'><h1>Villani Mini</h1><textarea placeholder='Tell me what you need done.' value={goal} onChange={e=>setGoal(e.target.value)} /><button>Start task</button></div>; }
