export function jsonRepair(input:string){ try{return JSON.parse(input);}catch{return {type:'ask_user',params:{question:'Please clarify'}};} }
