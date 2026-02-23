"use strict";(()=>{var a={};a.id=543,a.ids=[543],a.modules={261:a=>{a.exports=require("next/dist/shared/lib/router/utils/app-paths")},3295:a=>{a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},5495:(a,b,c)=>{c.d(b,{C:()=>n,N:()=>m});var d=c(96940),e=c(45711),f=c(70373),g=c(32838),h=c(71953),i=c(68488),j=c(65803);let k=e.Ik({needsReplan:e.zM(),updates:e.YO(e.Ik({taskId:e.Yj(),newTitle:e.Yj(),newDescription:e.Yj(),newVerificationCriteria:e.Ik({artifacts:e.YO(e.Yj()),manualCheck:e.Yj(),automatedCheck:e.Yj().optional()}).optional()})),reasoning:e.Yj()}),l=e.Ik({needsUpdates:e.zM(),updates:e.YO(e.Ik({taskId:e.Yj(),newDescription:e.Yj()})),reasoning:e.Yj()});async function m(a,b){let c=await f.z.task.findUnique({where:{id:b},include:{plan:{include:{project:!0}},comments:{orderBy:{createdAt:"desc"},take:1}}});if(!c||!c.plan?.project)throw Error("Completed task not found");let e=await f.z.task.findMany({where:{planId:c.planId,status:"TODO",id:{not:b}},orderBy:{createdAt:"asc"}});if(0===e.length)return{needsReplan:!1,reason:"No pending tasks"};let l=c.comments[0],m=l?.content||c.generatedPrompt||"",n=await (0,j.iY)(c.plan.projectId),o=e.map(a=>`- [ID: ${a.id}] ${a.title}
  ${a.description}`).join("\n\n"),p=`Ты — Технический Архитектор. Мы только что завершили задачу.

${n}

Завершенная задача: ${c.title}
Описание: ${c.description}
Отчет о выполнении: ${m}

План проекта: ${c.plan.title}
Стек: ${c.plan.techStack}

Оставшиеся задачи (статус TODO):
${o}

Проанализируй, влияет ли завершенная задача на оставшиеся задачи.
Например:
- Выбрана другая библиотека/технология?
- Изменилась архитектура проекта?
- Некоторые задачи теперь избыточны?
- Задачи требуют уточнения?
- Требуется ли обновление verificationCriteria (артефакты, проверки)?

Если задачи устарели или требуют изменений — перепиши их названия, описания и verificationCriteria.
Если всё актуально — верни needsReplan: false.`,q=c.plan.project,r=(0,g.Kd)(q.aiProvider??void 0),s=q.aiModel??"gpt-4o-mini",t=(0,g.E1)(r,s),u=q.aiModel??`${r}/${s}`,v=await (0,d.pY)({model:t,schema:k,system:"Ты внимательный технический архитектор. Анализируй влияние изменений на план проекта. Будь точным и избегай лишних изменений. При необходимости обновляй verificationCriteria используя методологию Goal-Backward Verification: QA должен иметь возможность доказать выполнение без глаз. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация или информация — ГУГЛИ. Не гадай.",prompt:p,temperature:.2});await (0,h.X)(v,{projectId:a,taskId:b,actionType:"replan",model:u});let{needsReplan:w,updates:x,reasoning:y}=v.object;if(!w||0===x.length)return{needsReplan:!1,reasoning:y};let z=x.map(async a=>{let{taskId:b,newTitle:d,newDescription:e,newVerificationCriteria:g}=a,h=await f.z.task.findUnique({where:{id:b}});return h?(await f.z.task.update({where:{id:b},data:{title:d,description:e,...g&&{verificationCriteria:g}}}),await f.z.comment.create({data:{taskId:b,content:`Автоматически обновлено Архитектором на основе завершенной задачи "${c.title}"`,authorRole:"TEAMLEAD"}}),{taskId:b,oldTitle:h.title,newTitle:d,newDescription:e}):null}),A=(await Promise.all(z)).filter(a=>null!==a);try{let a=`Ты — Software Architect. Мы изменили план проекта.

Завершенная задача: ${c.title}
Отчет о выполнении: ${m}

Обоснование изменений: ${y}

Измененные задачи:
${A.map(a=>`- ${a.oldTitle} -> ${a.newTitle}`).join("\n")}

Напиши **Architecture Decision Record (ADR)** для этого изменения в формате Markdown.

Структура:
# ADR-002: Изменение архитектурного плана
## Status
Accepted
## Context
Мы завершили задачу "${c.title}", что повлекло изменения в плане.
## Decision
Мы изменили задачи проекта, потому что: ${y}
## Consequences
Плюсы: ...
Минусы: ...`,e=(0,g.Kd)(c.plan.project.aiProvider??void 0),f=c.plan.project.aiModel??"gpt-4o-mini",j=(0,g.E1)(e,f),k=c.plan.project.aiModel??`${e}/${f}`,l=await (0,d.Df)({model:j,system:"Ты опытный Software Architect. Пиши чёткие и структурированные ADR. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",prompt:a,temperature:.3});await (0,h.X)(l,{projectId:c.plan.projectId,taskId:b,actionType:"generate-adr-replan",model:k});let n=Date.now();await (0,i.q)(c.plan.projectId,`002-architecture-change-${n}.md`,l.text)}catch(a){}return{needsReplan:!0,reasoning:y,updatedTasks:A}}async function n(a,b){let c=await f.z.task.findUnique({where:{id:b},include:{plan:{include:{project:!0}},comments:{orderBy:{createdAt:"desc"},take:1}}});if(!c||!c.plan?.project)throw Error("Completed task not found");let e=await f.z.task.findMany({where:{planId:c.planId,status:"TODO",id:{not:b}},orderBy:{createdAt:"asc"},take:2});if(0===e.length)return{needsUpdates:!1,reasoning:"No pending tasks"};let i=c.comments[0],k=i?.content||c.generatedPrompt||"",m=await (0,j.iY)(c.plan.projectId),n=e.map(a=>`- [ID: ${a.id}] ${a.title}
  ${a.description}`).join("\n\n"),o=`Ты — Технический Архитектор. Мы только что завершили задачу.

${m}

Завершенная задача: ${c.title}
Описание: ${c.description}
Отчет о выполнении: ${k}

Следующие задачи (статус TODO, только 2 следующих):
${n}

Проанализируй, влияет ли завершенная задача на эти задачи.
Например:
- Выбрана другая библиотека/технология? (например, перешли на Tailwind CSS)
- Изменилась архитектура проекта? (например, создали auth.ts с Clerk)
- Некоторые файлы были созданы/изменены с другими именами?
- Требуется ли обновление описания задач?

Если задачи устарели или требуют изменений — ОБНОВИ описания.
Если всё актуально — верни needsUpdates: false.

ВАЖНО: Используй цепочку рассуждений (Chain of Thought):
1. Сначала проанализируй, что было сделано в завершенной задаче
2. Затем проверь, влияет ли это на следующие задачи
3. Если влияет — предложи конкретные изменения в описании
4. Только затем обнови задачи`,p=c.plan.project,q=(0,g.Kd)(p.aiProvider??void 0),r=p.aiModel??"gpt-4o-mini",s=(0,g.E1)(q,r),t=p.aiModel??`${q}/${r}`,u=await (0,d.pY)({model:s,schema:l,system:"Ты внимательный технический архитектор. Быстро анализируй влияние завершенной задачи на следующие 2 задачи. Используй цепочку рассуждений: что сделано → что влияет → что обновить. Будь точным и избегай лишних изменений. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",prompt:o,temperature:.2});await (0,h.X)(u,{projectId:a,taskId:b,actionType:"quick-review",model:t});let{needsUpdates:v,updates:w,reasoning:x}=u.object;if(!v||0===w.length)return{needsUpdates:!1,reasoning:x};let y=w.map(async a=>{let{taskId:b,newDescription:d}=a,e=await f.z.task.findUnique({where:{id:b}});return e?(await f.z.task.update({where:{id:b},data:{description:d}}),await f.z.comment.create({data:{taskId:b,content:`🔄 Быстрый обзор: описание обновлено на основе завершенной задачи "${c.title}"

${x}`,authorRole:"TEAMLEAD"}}),{taskId:b,oldDescription:e.description,newDescription:d}):null});return{needsUpdates:!0,reasoning:x,updatedTasks:(await Promise.all(y)).filter(a=>null!==a)}}},10846:a=>{a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},19121:a=>{a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},22428:(a,b,c)=>{c.r(b),c.d(b,{handler:()=>G,patchFetch:()=>F,routeModule:()=>B,serverHooks:()=>E,workAsyncStorage:()=>C,workUnitAsyncStorage:()=>D});var d={};c.r(d),c.d(d,{GET:()=>z,PATCH:()=>A});var e=c(95736),f=c(9117),g=c(4044),h=c(39326),i=c(32324),j=c(261),k=c(54290),l=c(85328),m=c(38928),n=c(46595),o=c(3421),p=c(17679),q=c(41681),r=c(63446),s=c(86439),t=c(51356),u=c(10641),v=c(70373),w=c(5495);let x=["TODO","IN_PROGRESS","REVIEW","WAITING_APPROVAL","DONE"],y=["TASK_EXECUTOR","BACKEND","DEVOPS","TEAMLEAD"];async function z(a,{params:b}){try{let{taskId:a}=await b,c=await v.z.task.findUnique({where:{id:a},include:{dependencies:{include:{dependsOn:{select:{id:!0,title:!0,status:!0}}}}}});if(!c)return u.NextResponse.json({error:"Task not found"},{status:404});return u.NextResponse.json({success:!0,task:{id:c.id,title:c.title,description:c.description,status:c.status,executorAgent:c.executorAgent,observerAgent:c.observerAgent,generatedPrompt:c.generatedPrompt,branchName:c.branchName,dependencies:c.dependencies.map(a=>({id:a.dependsOn.id,title:a.dependsOn.title,status:a.dependsOn.status}))}})}catch(a){return console.error("[tasks:get]",a),u.NextResponse.json({error:"Failed to fetch task"},{status:500})}}async function A(a,{params:b}){try{let{taskId:c}=await b,d=await a.json().catch(()=>({})),e=d?.status,f=d?.executorAgent,g=Array.isArray(d?.dependencyIds)?d.dependencyIds.filter(a=>"string"==typeof a):void 0,h={};if("string"==typeof e&&x.includes(e)&&(h.status=e),null===f?h.executorAgent=null:"string"==typeof f&&y.includes(f)&&(h.executorAgent=f),void 0!==g){let a=await v.z.task.findUnique({where:{id:c},select:{planId:!0}});if(!a)return u.NextResponse.json({error:"Task not found"},{status:404});if(g.length>0){let b=await v.z.task.findMany({where:{id:{in:g},planId:a.planId},select:{id:!0}}),c=new Set(b.map(a=>a.id));if(g.filter(a=>!c.has(a)).length>0)return u.NextResponse.json({error:"Some dependency IDs are invalid or from another plan"},{status:400})}}if(0===Object.keys(h).length&&void 0===g)return u.NextResponse.json({error:"No valid fields to update"},{status:400});let i={...h};await v.z.$transaction(async a=>{let b=await a.task.update({where:{id:c},data:i});return void 0!==g&&(await a.taskDependency.deleteMany({where:{taskId:c}}),g.length>0&&await a.taskDependency.createMany({data:g.map(a=>({taskId:c,dependsOnId:a}))})),b});let j=await v.z.task.findUnique({where:{id:c},include:{dependencies:{include:{dependsOn:{select:{id:!0,title:!0,status:!0}}}},plan:{include:{project:{select:{id:!0}}}}}}),k=j?{...j,dependencies:j.dependencies.map(a=>({id:a.dependsOn.id,title:a.dependsOn.title,status:a.dependsOn.status}))}:null;if("DONE"===h.status&&j?.plan?.project?.id)try{await (0,w.N)(j.plan.project.id,c)}catch(a){}return u.NextResponse.json({success:!0,task:k})}catch(a){return u.NextResponse.json({error:"Failed to update task"},{status:500})}}let B=new e.AppRouteRouteModule({definition:{kind:f.RouteKind.APP_ROUTE,page:"/api/tasks/[taskId]/route",pathname:"/api/tasks/[taskId]",filename:"route",bundlePath:"app/api/tasks/[taskId]/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"/Users/artem/Desktop/cursor-diriger/ai-orchestrator/app/api/tasks/[taskId]/route.ts",nextConfigOutput:"standalone",userland:d}),{workAsyncStorage:C,workUnitAsyncStorage:D,serverHooks:E}=B;function F(){return(0,g.patchFetch)({workAsyncStorage:C,workUnitAsyncStorage:D})}async function G(a,b,c){var d;let e="/api/tasks/[taskId]/route";"/index"===e&&(e="/");let g=await B.prepare(a,b,{srcPage:e,multiZoneDraftMode:!1});if(!g)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:u,params:v,nextConfig:w,isDraftMode:x,prerenderManifest:y,routerServerContext:z,isOnDemandRevalidate:A,revalidateOnlyGenerated:C,resolvedPathname:D}=g,E=(0,j.normalizeAppPath)(e),F=!!(y.dynamicRoutes[E]||y.routes[D]);if(F&&!x){let a=!!y.routes[D],b=y.dynamicRoutes[E];if(b&&!1===b.fallback&&!a)throw new s.NoFallbackError}let G=null;!F||B.isDev||x||(G="/index"===(G=D)?"/":G);let H=!0===B.isDev||!F,I=F&&!H,J=a.method||"GET",K=(0,i.getTracer)(),L=K.getActiveScopeSpan(),M={params:v,prerenderManifest:y,renderOpts:{experimental:{cacheComponents:!!w.experimental.cacheComponents,authInterrupts:!!w.experimental.authInterrupts},supportsDynamicResponse:H,incrementalCache:(0,h.getRequestMeta)(a,"incrementalCache"),cacheLifeProfiles:null==(d=w.experimental)?void 0:d.cacheLife,isRevalidate:I,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d)=>B.onRequestError(a,b,d,z)},sharedContext:{buildId:u}},N=new k.NodeNextRequest(a),O=new k.NodeNextResponse(b),P=l.NextRequestAdapter.fromNodeNextRequest(N,(0,l.signalFromNodeResponse)(b));try{let d=async c=>B.handle(P,M).finally(()=>{if(!c)return;c.setAttributes({"http.status_code":b.statusCode,"next.rsc":!1});let d=K.getRootSpanAttributes();if(!d)return;if(d.get("next.span_type")!==m.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${d.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=d.get("next.route");if(e){let a=`${J} ${e}`;c.setAttributes({"next.route":e,"http.route":e,"next.span_name":a}),c.updateName(a)}else c.updateName(`${J} ${a.url}`)}),g=async g=>{var i,j;let k=async({previousCacheEntry:f})=>{try{if(!(0,h.getRequestMeta)(a,"minimalMode")&&A&&C&&!f)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let e=await d(g);a.fetchMetrics=M.renderOpts.fetchMetrics;let i=M.renderOpts.pendingWaitUntil;i&&c.waitUntil&&(c.waitUntil(i),i=void 0);let j=M.renderOpts.collectedTags;if(!F)return await (0,o.I)(N,O,e,M.renderOpts.pendingWaitUntil),null;{let a=await e.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(e.headers);j&&(b[r.NEXT_CACHE_TAGS_HEADER]=j),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,d=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=r.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:e.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:d}}}}catch(b){throw(null==f?void 0:f.isStale)&&await B.onRequestError(a,b,{routerKind:"App Router",routePath:e,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})},z),b}},l=await B.handleResponse({req:a,nextConfig:w,cacheKey:G,routeKind:f.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:y,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:C,responseGenerator:k,waitUntil:c.waitUntil});if(!F)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(j=l.value)?void 0:j.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});(0,h.getRequestMeta)(a,"minimalMode")||b.setHeader("x-nextjs-cache",A?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),x&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return(0,h.getRequestMeta)(a,"minimalMode")&&F||m.delete(r.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||b.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,q.getCacheControlHeader)(l.cacheControl)),await (0,o.I)(N,O,new Response(l.value.body,{headers:m,status:l.value.status||200})),null};L?await g(L):await K.withPropagatedContext(a.headers,()=>K.trace(m.BaseServerSpan.handleRequest,{spanName:`${J} ${a.url}`,kind:i.SpanKind.SERVER,attributes:{"http.method":J,"http.target":a.url}},g))}catch(b){if(b instanceof s.NoFallbackError||await B.onRequestError(a,b,{routerKind:"App Router",routePath:E,routeType:"route",revalidateReason:(0,n.c)({isRevalidate:I,isOnDemandRevalidate:A})}),F)throw b;return await (0,o.I)(N,O,new Response(null,{status:500})),null}}},29294:a=>{a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},44870:a=>{a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},63033:a=>{a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},68488:(a,b,c)=>{c.d(b,{L:()=>h,q:()=>i});var d=c(96940),e=c(70373),f=c(32838),g=c(71953);async function h(a,b){let c=await e.z.project.findUnique({where:{id:a}}),h=await e.z.plan.findUnique({where:{id:b}});if(!c||!h)throw Error("Project or plan not found");let i=`Ты — Software Architect. Мы начинаем проект "${c.ideaText}".
Выбран план: "${h.title}".
Стек: ${h.techStack}.

${h.description?`Описание плана: ${h.description}`:""}
${h.reasoning?`Обоснование выбора: ${h.reasoning}`:""}

Напиши **Architecture Decision Record (ADR)** в формате Markdown.

Структура:
# ADR-001: Выбор архитектуры и стека
## Status
Accepted
## Context
[Описание идеи проекта]
## Decision
Мы выбрали [План] и стек [Стек], потому что...
## Consequences
Плюсы: ...
Минусы: ...`,j=(0,f.Kd)(c.aiProvider??void 0),k=c.aiModel??"gpt-4o-mini",l=(0,f.E1)(j,k),m=c.aiModel??`${j}/${k}`,n=await (0,d.Df)({model:l,system:"Ты опытный Software Architect. Пиши чёткие и структурированные ADR. У тебя есть доступ в интернет через webSearch. Если нужна свежая документация — ГУГЛИ. Не гадай.",prompt:i,temperature:.3});return await (0,g.X)(n,{projectId:a,planId:b,actionType:"generate-adr",model:m}),n.text}async function i(a,b,c){return await e.z.syncCommand.create({data:{projectId:a,command:`Create file: docs/adr/${b}`,type:"WRITE_FILE",filePath:`docs/adr/${b}`,fileContent:c}})}},86439:a=>{a.exports=require("next/dist/shared/lib/no-fallback-error.external")},96330:a=>{a.exports=require("@prisma/client")}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[5873,1692,4120,6940,851,4491,9536],()=>b(b.s=22428));module.exports=c})();