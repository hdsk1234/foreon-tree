import {useEffect,useRef,type ReactNode} from 'react';
export function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
 return <dialog ref={dialog} className="game-modal" aria-label={title} onCancel={event=>{event.preventDefault();onClose();}}>
  <div className="modal-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}>×</button></div>{children}
 </dialog>;
}
