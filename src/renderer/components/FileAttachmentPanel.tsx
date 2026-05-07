import React from 'react';
export default function FileAttachmentPanel({files}:{taskId:string;files:any[];onChanged:()=>void}){ return <div><h3>Files</h3><button disabled title='Not available in this build'>Attach file</button><ul>{(files||[]).map((f:any)=><li key={f.id}>{f.extractionStatus} {f.summary} {f.errorMessage}</li>)}</ul><div>File attachment is not wired in this build.</div></div>; }
