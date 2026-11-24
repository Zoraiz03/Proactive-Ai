import { FixCodeSession } from './fix-code-session.ts';
import { validImproveContext, validImproveSuggestion } from '../shared/improve-code.ts';
import type { ObserverRequest } from '../shared/observer.ts';
import type { FixCodeResult } from '../shared/fix-code.ts';
import type { IpcResult } from '../shared/workspace.ts';

// Private adapter reuses the proven scope/privacy/checkpoint-ready validation engine.
// Provider-facing requests and public responses always keep Improve's separate contract.
export class ImproveCodeSession {
  private readonly session:FixCodeSession;
  private approved:ObserverRequest|null=null;
  constructor(deps:ConstructorParameters<typeof FixCodeSession>[0]) {
    this.session=new FixCodeSession({...deps,allowImproveConfiguration:true,ask:async(internal,signal)=>{
      const approved=this.approved;
      if(!approved?.improveCode)return {ok:false,error:'Improve Code review expired.'};
      const request={...approved,improveCode:{...approved.improveCode,clarifications:internal.fixCode!.clarifications}};
      const response=await deps.ask(request,signal);
      if(!response.ok)return response;
      if(!validImproveSuggestion(response.value.suggestion))return {ok:false,error:'Invalid Improve Code outcome. Nothing was applied. Preview a smaller scope and try again.'};
      const suggestion=response.value.suggestion;
      return {ok:true,value:{...response.value,suggestion:{...suggestion,fixOutcome:suggestion.improveOutcome==='improvement'?'correction':suggestion.improveOutcome==='clarification'?'clarification':'no_problem'}}};
    }});
  }
  private generation=0;
  clear(){this.generation++;this.busy=false;this.session.clear();this.approved=null;}
  async start(id:string,request:ObserverRequest,content:string):Promise<IpcResult<FixCodeResult>> {
    if(request.mode!=='improve_code'||request.kind!=='code'||!validImproveContext(request.improveCode)||request.fixCode||request.liveObserver||request.automaticRun||request.explanation)return {ok:false,error:'Invalid Improve Code review. Preview the current scope again.'};
    // Do not change the approved request while an older ask is in flight.
    if(this.busy)return {ok:false,error:'An Improve Code request is already in progress.'};
    this.session.clear();
    this.approved=structuredClone({...request,storeHistory:false});
    const internal={...request,mode:'fix_error' as const,improveCode:undefined,fixCode:{...request.improveCode,scope:request.improveCode.scope==='file'?'file' as const:'selection' as const}};
    return this.perform(()=>this.session.start(id,internal,content));
  }
  private busy=false;
  async send(id:string,answer:string,hash:string){return this.perform(()=>this.session.send(id,answer,hash));}
  private async perform(invoke:()=>Promise<IpcResult<FixCodeResult>>):Promise<IpcResult<FixCodeResult>> {
    if(this.busy)return {ok:false,error:'An Improve Code request is already in progress.'};
    this.busy=true;
    const token=this.generation;
    try {
      const result=await invoke();
      if(token!==this.generation)return {ok:false,error:'Improve Code cancelled.'};
      if(!result.ok)return {...result,error:result.error.replaceAll('Fix Code','Improve Code').replaceAll('correction','improvement')};
      const {fixOutcome: _internal,...suggestion}=result.value.suggestion;
      void _internal;
      const request={...this.approved!,improveCode:{...this.approved!.improveCode!,clarifications:result.value.request.fixCode!.clarifications}};
      return {ok:true,value:{request,suggestion}};
    } finally {if(token===this.generation)this.busy=false;}
  }
}
