"use strict";exports.id=4241,exports.ids=[4241],exports.modules={37580:(a,b,c)=>{c.d(b,{generateTextZai:()=>d});async function d(a){let{systemPrompt:b,userMessage:c,model:d,temperature:e=.2,maxTokens:f=256}=a,g=process.env.ZAI_API_KEY,h=(process.env.ZAI_BASE_URL||"https://api.z.ai/api/coding/paas/v4").replace(/\/$/,"");if(!g)throw Error("Missing ZAI_API_KEY");let i=`${h}/chat/completions`,j=await fetch(i,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${g}`},body:JSON.stringify({model:d,messages:[{role:"system",content:b},{role:"user",content:c}],temperature:e,max_tokens:f,thinking:{type:"disabled"}})});if(!j.ok)throw Error(await j.text()||`Z.ai API ${j.status}`);let k=await j.json(),l=k.choices?.[0]?.message,m=l?.content?.trim(),n=l?.reasoning_content?.trim();return(m||n||"").trim()}},38842:(a,b,c)=>{c.d(b,{L:()=>q});var d=c(96940),e=c(45711),f=c(70373),g=c(32838),h=c(63231),i=c(71953);let j=e.Ik({symptoms:e.Ik({expected:e.Yj(),actual:e.Yj(),missing_evidence:e.Yj()})});async function k(a){let{projectId:b,taskId:c,qaReasoning:e,verificationCriteria:h,executorReport:k}=a,l=`You are a Debug Specialist analyzing a QA rejection following the GSD methodology.

=== CONTEXT ===
QA Agent REJECTED the task and provided this reasoning:
"${e}"

=== VERIFICATION CRITERIA (what was required) ===
${h?`${h.artifacts&&h.artifacts.length>0?`[Artifacts]
${h.artifacts.map(a=>`  - ${a}`).join("\n")}
`:""}${h.manualCheck?`[manualCheck]
${h.manualCheck}
`:""}${h.automatedCheck?`[automatedCheck]
${h.automatedCheck}
`:""}`:"No verification criteria provided"}

=== EXECUTOR REPORT (what was submitted) ===
${k}

=== YOUR MISSION ===
Analyze the rejection and generate a Debug Summary in GSD format.

Fill in these three fields:

1. **expected**: What the QA Agent required based on verificationCriteria
   - List the required artifacts
   - List the required automated checks (tests/builds)
   - List the required manual verification steps

2. **actual**: What the Executor actually provided in their report
   - What evidence was actually shown?
   - What files were mentioned/shown?
   - What test/build outputs were provided?
   - What confirmations were given?

3. **missing_evidence**: What evidence is missing to satisfy the QA
   - Be SPECIFIC about what's missing
   - If artifacts are missing: list which files need to be shown
   - If automatedCheck failed: say what logs/output are needed
   - If manualCheck missing: specify what confirmation/screenshot is needed

OUTPUT FORMAT (EXACT):
Return ONLY valid JSON with this structure:
{
  "symptoms": {
    "expected": "concise summary of what was required",
    "actual": "concise summary of what was submitted",
    "missing_evidence": "concise list of what's missing"
  }
}

EXAMPLE:
If QA says "Verification Failed. Missing evidence for: [Artifacts] Please provide ls -la output showing src/app/api/auth/route.ts exists. [automatedCheck] Please provide npm run test output showing PASS."

Your output should be:
{
  "symptoms": {
    "expected": "Create src/app/api/auth/route.ts with authentication logic and run npm run test",
    "actual": "Report mentions authentication implementation but does not show file content or test results",
    "missing_evidence": "1. ls -la output or full content of src/app/api/auth/route.ts
2. npm run test output showing PASS status"
  }
}`,m=await f.z.project.findUnique({where:{id:b},select:{aiProvider:!0,aiModel:!0}}),n=(0,g.Kd)(m?.aiProvider??void 0),o=m?.aiModel??"gpt-4o-mini",p=(0,g.E1)(n,o),q=m?.aiModel??`${n}/${o}`,r=await (0,d.Df)({model:p,system:"You are a Debug Specialist following GSD methodology. Your job is to analyze QA rejections and generate clear Debug Summaries that help developers understand exactly what evidence is missing. Be concise, specific, and actionable.",prompt:l,temperature:.2});await (0,i.X)(r,{projectId:b,taskId:c,actionType:"debug_analysis",model:q});let s=j.safeParse(JSON.parse(r.text?.trim()||"{}"));if(!s.success)throw console.error("[Debug] Failed to parse response:",r.text,s.error),Error("Debug analysis response parsing failed");return s.data}var l=c(65803),m=c(41688),n=c(64516);async function o(a,b,c="\uD83D\uDD0D"){try{await f.z.comment.create({data:{taskId:a,content:`${c} ${b}`,authorRole:"QA",isSystem:!0}})}catch(a){console.error("[QA] Failed to add system comment:",a)}}let p=e.Ik({status:e.k5(["APPROVED","REJECTED"]),reasoning:e.Yj(),confidence:e.ai().min(0).max(1)});async function q(a,b){(0,m.xZ)(a,"START","Starting QA verification",{reportLength:b.length,reportPreview:b.slice(0,200)}),await o(a,"\uD83D\uDD0D Начинаю QA проверку выполнения задачи...");let c=await f.z.task.findUnique({where:{id:a},include:{plan:{include:{project:!0}},comments:{orderBy:{createdAt:"desc"},take:5}}});if(!c||!c.plan?.project)throw(0,m.xZ)(a,"ERROR","Task not found"),Error("Task not found");let e=c.plan.project,j=c.plan;(0,m.xZ)(a,"TASK_INFO","Task loaded",{title:c.title,executorAgent:c.executorAgent,status:c.status}),await o(a,"\uD83D\uDCCB Загружена задача: "+c.title),b.toLowerCase().includes("test")||b.toLowerCase().includes("pass")||b.toLowerCase().includes("✓")||b.toLowerCase().includes("✅"),b.toLowerCase().includes("build")||b.toLowerCase().includes("compiled")||b.toLowerCase().includes("npm run")||b.toLowerCase().includes("npm run build");let q=c.comments.map(a=>a.content).join("\n---\n"),r=c.verificationCriteria;if((0,m.xZ)(a,"VC_LOADED","Verification criteria loaded",r),r){let b=[];r.artifacts?.length&&b.push(`📁 Файлы: ${r.artifacts.join(", ")}`),r.automatedCheck&&b.push("\uD83E\uDD16 Авто-проверка: "+r.automatedCheck),r.manualCheck&&b.push("\uD83D\uDC64 Ручная проверка: "+r.manualCheck),await o(a,b.join("\n"),"✅")}let s=await (0,l.iY)(e.id);(0,m.xZ)(a,"CONTEXT","Project context loaded",{contextLength:s.length,contextPreview:s.slice(0,200)});let t=`You are a strict QA Specialist following GSD Goal-Backward Verification methodology.

${s}

=== TASK INFORMATION ===
Task Title: ${c.title}
Description: ${c.description}
Executor Role: ${c.executorAgent||"Not specified"}

Project Plan: ${j.title}
Tech Stack: ${j.techStack}

=== VERIFICATION CRITERIA (from Architect) ===
${r?`${r.artifacts&&r.artifacts.length>0?`[Artifacts]
Expected files:
${r.artifacts.map(a=>`  - ${a}`).join("\n")}
`:""}
${r.manualCheck?`[manualCheck]
${r.manualCheck}
`:""}
${r.automatedCheck?`[automatedCheck]
${r.automatedCheck}
`:""}`:""}
=== END VERIFICATION CRITERIA ===

=== EXECUTOR REPORT (evidence) ===
${b}
=== END EXECUTOR REPORT ===

${q?`=== PREVIOUS COMMENTS ===
${q}
=== END PREVIOUS COMMENTS ===

`:""}

=== YOUR MISSION ===
Follow the GSD Verification Protocol to decide if this task is COMPLETE.

**STEP 1**: Read the Verification Criteria above.
**STEP 2**: Search the Executor Report for evidence for EACH criteria point:
   - [Artifacts]: Look for ls -la output, file content, or file creation logs
   - [automatedCheck]: Look for test/build success logs, PASS markers
   - [manualCheck]: Look for confirmation text or screenshot descriptions
**STEP 3**: Check if ALL criteria have sufficient evidence.
**STEP 4**: Make your decision.

**CRITICAL RULE**: If ANY criteria point has NO evidence in the report — REJECT with:
"Verification Failed. Missing evidence for: [criteria name]. Please provide [specific evidence needed]."

**HEADLESS EXCEPTION**: Executor runs in Docker/headless (no browser). If manualCheck only asks for "open in browser", "screenshot", or "visual confirmation", and Artifacts + automatedCheck both have evidence, APPROVE and state that manual check is deferred to user.

**TICKET RUN EXCEPTION**: If the report contains "[Ticket run]" and states that "automatedCheck from the original task was skipped" (implementation was modified by the ticket), do NOT require automatedCheck evidence. APPROVE when: (1) Artifacts have evidence (files exist), and (2) the report describes the implementation (e.g. file content or tool outputs). The original automatedCheck may fail on modified output (e.g. HTML with new tags splitting text); that is expected for ticket runs.

Only APPROVE when:
✓ All Artifacts are mentioned/shown in the report
✓ All automatedCheck commands show success (PASS, Build success, no errors)
✓ manualCheck has confirmation or screenshot description
✓ No visible syntax/logic errors in code

Evidence examples you should ACCEPT:
- "ls -la" output showing the file exists
- Full file content in code blocks
- "PASS" or "✓" in test output
- "Build success" or "Compiled successfully" messages
- "I verified X and it works" text

Evidence examples you should REJECT:
- No mention of required files at all
- Test output with FAIL or errors
- Build output with compilation errors
- No confirmation for manual checks

ВАЖНО: Ответь ТОЛЬКО валидным JSON в следующем формате:
{
  "status": "APPROVED" или "REJECTED",
  "reasoning": "For APPROVED: List each criteria and the evidence found. For REJECTED: Start with 'Verification Failed. Missing evidence for:' and list missing criteria with specific evidence needed.",
  "confidence": число от 0.0 до 1.0
}`,u=(0,g.Kd)(e.aiProvider??void 0),v=e.aiModel??"gpt-4o-mini",w=(0,g.E1)(u,v),x=e.aiModel??`${u}/${v}`;(0,m.xZ)(a,"AI_CALL","Calling AI for QA verification",{model:x,reportLength:b.length,hasVC:!!r}),await o(a,"\uD83E\uDD16 Анализирую отчет с помощью AI ("+x+")...");let y=(0,h.bB)(e.id),z=await (0,n.Z9)(),A=Math.min(z.temperature,.1),B=`You are a strict QA Specialist following the GSD (Goal-Backward Verification) methodology.
Your job is to verify task completion based on the report provided by the Executor Agent (User/Cursor).

### CRITICAL RUNTIME CONTEXT
- **You are running inside a Docker Container.**
- **The Code is on the User's Host Machine.**
- **YOU DO NOT HAVE DIRECT ACCESS TO THE FILE SYSTEM.**
- **YOU CANNOT ACCESS LOCALHOST (127.0.0.1) OF THE USER.**

### GSD VERIFICATION PROTOCOL (STRICT)

Follow this exact algorithm:

#### STEP 1: READ VERIFICATION CRITERIA
Extract the verificationCriteria from the task:
- **Artifacts**: File paths that must exist
- **automatedCheck**: Commands that must succeed (tests, builds)
- **manualCheck**: What must be verified manually

#### STEP 2: COLLECT EVIDENCE FROM REPORT
For each criteria point, search for evidence:

**A. For Artifacts:**
- Look for \`ls -la\` output showing the file exists
- Look for full file content in the report (code blocks, \`\`\`filename\`\`\`)
- Look for \`cat\` or \`cat <filename>\` commands with file content
- Look for file creation logs (e.g., "Created src/app/api/auth/route.ts")

**B. For automatedCheck:**
- Look for test execution logs (e.g., "PASS", "✓", "All tests passed")
- Look for build success messages (e.g., "Build success", "Compiled successfully")
- Look for command output from the specified automatedCheck command
- Look for npm/yarn output showing successful execution

**C. For manualCheck:**
- Look for textual confirmation ("I verified X", "Y works as expected")
- Look for screenshot descriptions or base64 image data
- Look for UI behavior descriptions matching the criteria

#### STEP 3: VALIDATE EVIDENCE (TRUTH CHECK)
For each criteria point, decide if the evidence is sufficient:
- **Artifacts**: Sufficient if file is mentioned OR full content is shown OR \`ls\` output shows it
- **automatedCheck**: Sufficient if logs show successful execution OR no errors in output
- **manualCheck**: Sufficient if user explicitly confirms verification OR describes expected behavior

#### STEP 4: MAKE DECISION
**APPROVE (status: "APPROVED"):**
- ALL verificationCriteria points have sufficient evidence
- No visible syntax/logic errors in provided code
- No errors in logs

**REJECT (status: "REJECTED"):**
- AT LEAST ONE verificationCriteria point has NO evidence
- Evidence contradicts criteria
- Visible syntax/logic errors
- Report contains no code/logs at all

#### STEP 5: GENERATE REASONING
**If APPROVED:**
- List each criteria point and the evidence found
- Example: "✓ Artifacts: Found src/app/api/auth/route.ts in ls output. ✓ automatedCheck: npm run test shows PASS."

**If REJECTED:**
- Start with: "Verification Failed. Missing evidence for:"
- List ALL missing criteria points
- For each missing point, specify what evidence is needed
- Example: "Verification Failed. Missing evidence for: [Artifacts] Please provide ls -la output or file content showing src/app/api/auth/route.ts exists. [automatedCheck] Please provide npm run test output showing PASS."

### CODE REVIEW CHECKLIST (when evidence exists)
When reviewing provided code snippets, check for:
- Hardcoded secrets, API keys, or sensitive data
- Missing type annotations (any in TypeScript)
- Logic errors
- Security vulnerabilities
- Missing error handling
- Incorrect imports

### IMPORTANT RULES
- **NEVER REJECT** because "File not found" or "Cannot connect to localhost" — THIS IS EXPECTED.
- ONLY approve when ALL criteria have evidence.
- Use GSD terminology: "Artifacts", "Truths" (evidence that proves criteria).

### ENVIRONMENT LIMITATIONS (approve when artifact + manual evidence exist)
- If **Artifacts** have clear evidence (ls -la output, file content in report, or "Created X" / "written successfully") AND **manualCheck** is confirmed in the report (e.g. "отображается текст", "I verified"), but **automatedCheck** failed only because a shell command is missing in the environment (e.g. "file: command not found", "command not found", "not found"), then **APPROVE**.
- In the reasoning, state: artifact and manual check satisfied; automatedCheck failed due to environment (missing command), not due to task implementation.

### HEADLESS / DOCKER: manualCheck requiring browser or screenshot
- **Executor runs in a container/headless environment. It CANNOT open a real browser, take screenshots, or perform visual UI checks.**
- If **Artifacts** and **automatedCheck** BOTH have sufficient evidence in the report (files exist, automated command succeeded), and **manualCheck** ONLY requires "open in browser", "screenshot", "visual confirmation", or "displayed on page", then **APPROVE**.
- In the reasoning, state: Artifacts and automatedCheck satisfied; manualCheck requires browser/visual verification which is not available in this environment — deferred to user. Do NOT REJECT solely because the report lacks screenshot or "I opened in browser" text.

### TICKET RUN: automatedCheck skipped
- If the report contains **"[Ticket run]"** and states that **"automatedCheck from the original task was skipped"** (implementation was modified by the ticket), do NOT require automatedCheck evidence.
- APPROVE when: (1) **Artifacts** have evidence (files exist, ls -la or content), and (2) the report describes the implementation (tool outputs, file content). The original task's automatedCheck (e.g. grep for exact phrase) may fail when output was changed by the ticket (e.g. HTML with spans); that is expected.
- In the reasoning, state: Ticket run; automatedCheck skipped per ticket-run rule. Artifacts satisfied; evidence from report.

ВАЖНО: Ответь ТОЛЬКО валидным JSON в следующем формате:
{
  "status": "APPROVED" или "REJECTED",
  "reasoning": "подробное объяснение решения с указанием доказательств или отсутствия доказательств по каждому критерию",
  "confidence": число от 0.0 до 1.0
}`,C=async b=>{let c=await (0,d.Df)({model:w,system:B,prompt:b??t,tools:y,maxSteps:5,maxTokens:z.maxTokens,temperature:A});await (0,i.X)(c,{projectId:e.id,taskId:a,actionType:"qa_check",model:x});let f=c.text?.trim()??"";f.startsWith("```")&&(f=f.replace(/^\s*```(?:json)?\s*\n?/i,"").replace(/\n?\s*```\s*$/g,"").trim()),f||(f="{}");let g=p.safeParse(JSON.parse(f));if(!g.success)throw Error("QA response parsing failed");return g.data},D=await C();if("REJECTED"===D.status&&D.confidence<.7){(0,m.xZ)(a,"RETRY","Low-confidence REJECTED, requesting second opinion",{confidence:D.confidence,threshold:.7}),await o(a,"\uD83D\uDD04 Низкая уверенность при отклонении — повторная проверка...");try{let b=await C(t+"\n\n[SECOND OPINION] Re-evaluate. If evidence is borderline or partially present for the criteria, prefer APPROVED.");"APPROVED"===b.status&&(D=b,await o(a,"✅ После повторной проверки: решение изменено на APPROVED.\n\n"+b.reasoning))}catch(a){}}let{status:E,reasoning:F,confidence:G}=D,H="APPROVED"===E?e.requireApproval?"WAITING_APPROVAL":"DONE":"REJECTED";(0,m.xZ)(a,"DECISION","QA decision made",{status:E,finalStatus:H,confidence:G,reasoningPreview:F.slice(0,300)});let I="APPROVED"===E?e.requireApproval?"WAITING_APPROVAL":"DONE":"REJECTED";"APPROVED"===E?await o(a,"✅ QA ПРОВЕРКА ПРОЙДЕНА!\n\n"+F,"\uD83C\uDF89"):await o(a,"❌ QA ПРОВЕРКА НЕ ПРОЙДЕНА!\n\n"+F,"\uD83D\uDEAB"),await f.z.task.update({where:{id:a},data:{status:I}});let J=null;if("REJECTED"===E)try{J=await k({projectId:e.id,taskId:a,qaReasoning:F,verificationCriteria:r,executorReport:b});let c=`<symptoms>
expected: ${J.symptoms.expected}
actual: ${J.symptoms.actual}
missing_evidence: ${J.symptoms.missing_evidence}
</symptoms>`;await f.z.comment.create({data:{taskId:a,content:`🐛 Debug Summary (GSD)

${c}`,authorRole:"QA"}})}catch(a){}return{taskId:a,status:E,finalStatus:I,reasoning:F,confidence:G,taskTitle:c.title,debugSummary:J}}},41688:(a,b,c)=>{c.d(b,{PZ:()=>k,ol:()=>j,xZ:()=>i});var d=c(29021),e=c.n(d),f=c(33873),g=c.n(f);let h=g().join(process.cwd(),"logs","qa");function i(a,b,c,d){if(!process.env.ENABLE_QA_LOGS)return;let f=new Date().toISOString().split("T")[0],i=g().join(h,`qa-${f}.log`),j=new Date().toISOString(),k=`[${j}][QA][${a}][${b}] ${c}`;d&&(k+=`
${JSON.stringify(d,null,2)}`),console.log(k);try{e().existsSync(h)||e().mkdirSync(h,{recursive:!0}),e().appendFileSync(i,k+"\n")}catch(a){console.error("[QA Logger] Failed to write log:",a)}}function j(a){try{let b=new Date().toISOString().split("T")[0],c=g().join(h,`qa-${b}.log`);if(!e().existsSync(c))return[];return e().readFileSync(c,"utf-8").split("\n").filter(b=>b.includes(a)).filter(a=>a.trim().length>0)}catch(a){return console.error("[QA Logger] Failed to read logs:",a),[]}}function k(a=100){try{let b=new Date().toISOString().split("T")[0],c=g().join(h,`qa-${b}.log`);if(!e().existsSync(c))return[];return e().readFileSync(c,"utf-8").split("\n").filter(a=>a.trim().length>0).slice(-a)}catch(a){return console.error("[QA Logger] Failed to read logs:",a),[]}}},64516:(a,b,c)=>{c.d(b,{Xx:()=>k,Z9:()=>i,l3:()=>j});var d=c(70373);let e={DEFAULT_MAX_TOKENS:"defaultMaxTokens",DEFAULT_TEMPERATURE:"defaultTemperature",DEFAULT_AI_PROVIDER:"defaultAiProvider",DEFAULT_AI_MODEL:"defaultAiModel"},f=[{key:"OPENAI_API_KEY",label:"OpenAI API Key",envKey:"OPENAI_API_KEY"},{key:"OPENAI_BASE_URL",label:"OpenAI Base URL",envKey:"OPENAI_BASE_URL"},{key:"ANTHROPIC_API_KEY",label:"Anthropic API Key",envKey:"ANTHROPIC_API_KEY"},{key:"OPENROUTER_API_KEY",label:"OpenRouter API Key",envKey:"OPENROUTER_API_KEY"},{key:"OPENROUTER_BASE_URL",label:"OpenRouter Base URL",envKey:"OPENROUTER_BASE_URL"},{key:"ZAI_API_KEY",label:"Z.ai API Key",envKey:"ZAI_API_KEY"},{key:"ZAI_BASE_URL",label:"Z.ai Base URL",envKey:"ZAI_BASE_URL"}],g={defaultMaxTokens:4096,defaultTemperature:.2,defaultAiProvider:process.env.AI_PROVIDER?.trim()||"openai",defaultAiModel:process.env.AI_MODEL?.trim()||"gpt-4o-mini"},h={maxTokens:8192,temperature:.2,defaultProvider:process.env.AI_PROVIDER?.trim()||"openai",defaultModel:process.env.AI_MODEL?.trim()||"gpt-4o-mini"};async function i(){let a=new Map((await d.z.setting.findMany({where:{key:{in:Object.values(e)}}})).map(a=>[a.key,a.value])),b=a.get(e.DEFAULT_MAX_TOKENS),c=a.get(e.DEFAULT_TEMPERATURE),f=null!=b?parseInt(String(b),10):NaN,g=null!=c?parseFloat(String(c)):NaN;return{maxTokens:Number.isFinite(f)&&f>0?f:h.maxTokens,temperature:Number.isFinite(g)&&g>=0&&g<=2?g:h.temperature,defaultProvider:a.get(e.DEFAULT_AI_PROVIDER)?.trim()||h.defaultProvider,defaultModel:a.get(e.DEFAULT_AI_MODEL)?.trim()||h.defaultModel}}async function j(){let a={};for(let{key:b,label:c,envKey:d}of f){let{set:e,masked:f}=function(a){let b=process.env[a];return{set:!!b?.trim(),masked:function(a){if(!a||"string"!=typeof a)return"";let b=a.trim();return b.length<=6?"***":(b.length,b.slice(0,3)+"***"+b.slice(-3))}(b)}}(d);a[b]={set:e,masked:f,label:c}}let b=new Map((await d.z.setting.findMany({where:{key:{in:Object.values(e)}}})).map(a=>[a.key,a.value])),c=parseInt(b.get(e.DEFAULT_MAX_TOKENS)??"",10),h=parseFloat(b.get(e.DEFAULT_TEMPERATURE)??"");return{keys:a,defaults:{defaultMaxTokens:Number.isFinite(c)?c:g.defaultMaxTokens,defaultTemperature:Number.isFinite(h)?h:g.defaultTemperature,defaultAiProvider:b.get(e.DEFAULT_AI_PROVIDER)??g.defaultAiProvider,defaultAiModel:b.get(e.DEFAULT_AI_MODEL)??g.defaultAiModel}}}async function k(a){let b=[];for(let[c,f]of(void 0!==a.defaultMaxTokens&&b.push([e.DEFAULT_MAX_TOKENS,String(a.defaultMaxTokens)]),void 0!==a.defaultTemperature&&b.push([e.DEFAULT_TEMPERATURE,String(a.defaultTemperature)]),void 0!==a.defaultAiProvider&&b.push([e.DEFAULT_AI_PROVIDER,a.defaultAiProvider]),void 0!==a.defaultAiModel&&b.push([e.DEFAULT_AI_MODEL,a.defaultAiModel]),b))await d.z.setting.upsert({where:{key:c},create:{key:c,value:f},update:{value:f}})}},99104:(a,b,c)=>{c.d(b,{J:()=>j});var d=c(96940),e=c(70373),f=c(32838),g=c(71953),h=c(37580),i=c(65803);async function j(a,b=!1,c=!1,k){let l,m=await e.z.task.findUnique({where:{id:a},include:{dependencies:{include:{dependsOn:{select:{id:!0,title:!0,status:!0}}}},plan:{include:{project:{include:{files:!0}}}},attachments:!0}});if(!m||!m.plan?.project)throw Error("Task not found");if(m.generatedPrompt&&!b)return m.generatedPrompt;let n=m.plan.project,o=m.plan,p=await (0,i.iY)(n.id),q=n.context?.trim()??"",r='Ты — Tech Lead. Твоя цель — написать идеальный промпт для разработчика (или для Cursor AI), чтобы он выполнил эту конкретную задачу.\n\n### DYNAMIC CONTEXT AWARENESS\nYou are generating coding instructions for the CURRENT task.\nLook at the **Project State** provided below and ADAPT your instructions accordingly:\n1. **Check Completed Tasks**: What was just built? Does this task depend on it?\n2. **Check Key Decisions (ADR)**: Did tech stack change? New libraries added?\n3. **ADAPT Instructions**:\n   - If Task 1 created `auth.ts` using Clerk, and Task 2 is "Login Page", explicitly tell developer to import from `auth.ts`, even if original plan didn\'t mention Clerk.\n   - If a recent task switched to Tailwind CSS, make sure UI tasks use Tailwind classes.\n   - If a task added TypeScript types, reference those types instead of `any`.\n   - ALWAYS check the project state first, then generate context-aware instructions.\n\n'+((q?`Учитывай глобальный контекст проекта при генерации ответа: ${q}

`:"")||"")+"Включи в промпт:\n- Контекст проекта.\n"+`- Технический стек (${o.techStack}).
`+"- Четкие шаги реализации (Step-by-step).\n- Какие файлы создать или изменить.\n- Примерный код или структуру.",s=m.dependencies??[],t=s.filter(a=>"DONE"!==a.dependsOn.status),u=s.filter(a=>"DONE"===a.dependsOn.status),v=t.length>0?"\n\nВНИМАНИЕ — зависимости:\n"+t.map(a=>`Эта задача зависит от выполнения задачи \xab${a.dependsOn.title}\xbb. Убедись, что код совместим с результатами той задачи.`).join("\n"):"",w=u.length>0?"\n\nУчитывай результаты уже выполненных задач: "+u.map(a=>`\xab${a.dependsOn.title}\xbb`).join(", "):"",x=m.attachments.filter(a=>a.visionAnalysis&&a.visionAnalysis.trim().length>0).map(a=>`=== DESIGN IMAGE: ${a.fileName} ===
Image URL: ${a.filePath}

AI Vision Analysis:
${a.visionAnalysis}
`).join("\n"),y=x.length>0?`

=== DESIGN CONTEXT FROM IMAGES ===
`+x+`
IMPORTANT: The AI Vision Analysis above describes the design. Use these details to implement the UI/layout correctly.`:"",z=`=== PROJECT STATE ===
${p}

=== CURRENT TASK ===
Задача: ${m.title}
Описание задачи: ${m.description}
Роль исполнителя: ${m.executorAgent??"TEAMLEAD"}

`+v+w+y+`

=== INSTRUCTIONS ===
`+`Generate detailed coding instructions for the task above.
`+`IMPORTANT: Consider the Project State above and adapt instructions based on:
`+`1. What was already built in completed tasks
`+`2. Any tech stack changes or additions from ADRs
`+`3. Dependencies on previous tasks
`+"4. Design details from Vision Analysis (if provided above)";k&&k.trim()&&(z+=`

=== NEW REQUIREMENT (TICKET) ===
${k.trim()}

Regenerate or adapt the instructions for this task so that this new requirement is fully satisfied, while preserving the original intent of the task.`);let A=(0,f.Kd)(n.aiProvider??process.env.AI_PROVIDER),B=n.aiModel??process.env.AI_MODEL??("anthropic"===A?"claude-3-5-sonnet-latest":"zai"===A?"glm-4.7":"gpt-4o-mini");if(!(0,f.vr)(A))throw Error(`Missing API key for provider: ${A}`);let C=null;l="zai"===A?await (0,h.generateTextZai)({systemPrompt:r,userMessage:z,model:B,temperature:.3,maxTokens:8e3}):(C=await (0,d.Df)({model:(0,f.E1)(A,B),system:r,prompt:z,temperature:.3,maxTokens:8e3})).text??"",C&&await (0,g.X)(C,{projectId:n.id,taskId:m.id,actionType:"prompt_gen",model:B});let D=l.trim();return c||await e.z.task.update({where:{id:m.id},data:{generatedPrompt:D}}),D}}};