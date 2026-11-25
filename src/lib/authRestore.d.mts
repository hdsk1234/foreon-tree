import type {Auth,User} from 'firebase/auth';
export function restoreGuest(auth:Auth,prepare:()=>Promise<void>,create:()=>Promise<User>,lock?:(task:()=>Promise<User>)=>Promise<User>):Promise<User>;
