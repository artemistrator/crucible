# Cursor Prompt: Graph Node Task Visualization (Variant 2 — Expanding Nodes)

## Context

I have a task graph view (like Mermaid diagrams) where nodes represent tasks connected by edges showing dependencies. Each task goes through states: `TODO → RUNNING → DONE`. I need to implement rich visual states for graph nodes that show exactly what's happening inside each task during LLM execution.

---

## What to implement

### 1. NODE STATES

Each graph node (`<div class="graph-node">`) must support three visual states via CSS classes:

#### `state-todo` (default)
- Border: `1.5px solid #252840`
- Background: `#10131d`
- Dot indicator: gray `#4a5070`
- No animation
- Opacity: `1`

#### `state-running`
- Border: `1.5px solid #f59e0b` with glow: `box-shadow: 0 0 0 2px rgba(245,158,11,0.15), 0 0 30px rgba(245,158,11,0.1)`
- Amber pulsing dot indicator (see dot animation below)
- Node EXPANDS to show internal pipeline stages (see section 2)
- A scanning line animates across the top border of the card
- Progress bar appears at the bottom of the node

#### `state-done`
- Border: `1.5px solid #22c55e` with subtle glow: `box-shadow: 0 0 0 1px rgba(34,197,94,0.2)`
- Green dot indicator
- Node shows collapsed summary: checkmark + "Completed in Xs · $0.000X"
- All pipeline stages hidden, replaced by a single done row
- NO animation (static, calm)

---

### 2. EXPANDING PIPELINE STAGES (only in `state-running`)

When a node transitions to `state-running`, it smoothly expands (CSS `max-height` transition from `0` to `auto`, duration `0.35s ease`) to reveal internal pipeline stages below the task title.

Stages list (in order):
1. `generate_prompt()`
2. `call_llm()`
3. `write_report()`
4. `save_files()`

Each stage row (`.gnode-stage`) layout:
```
[icon/spinner]  [stage name]  [optional right label]
```

**Stage states:**

`stage-done`:
- Icon: `✓` in green `#22c55e`
- Text color: `#22c55e`
- Background: `rgba(34,197,94,0.06)`
- Right label: token count or time, e.g. `847 tk` in muted color

`stage-running`:
- Icon: CSS-only spinning circle (no images/SVG files)
  ```css
  .mini-spinner {
    width: 11px; height: 11px;
    border: 1.5px solid rgba(245,158,11,0.25);
    border-top-color: #f59e0b;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  ```
- Text color: `#f59e0b` (amber)
- Background: `rgba(245,158,11,0.07)`
- Right label: `· streaming...` or `· thinking...` — blinking with opacity animation
- Subtle blink animation on the whole row background

`stage-pending`:
- Icon: `○`
- Text color: `#4a5070` (muted)
- Background: transparent
- No animation

---

### 3. PROGRESS BAR (inside running node, below stages)

```css
.gnode-progress {
  margin-top: 10px;
  height: 2px;
  background: #1e2235;
  border-radius: 2px;
  overflow: hidden;
}
.gnode-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4f7ef8, #8b5cf6);
  border-radius: 2px;
  transition: width 0.8s ease;
}
```

Below the bar show: left-aligned `{percent}%` and right-aligned estimated time `~{N}s` — both in monospace 9px muted color.

---

### 4. DOT INDICATOR ANIMATIONS

```css
/* Amber pulsing dot for RUNNING */
.dot-running {
  background: #f59e0b;
  box-shadow: 0 0 6px #f59e0b;
  animation: pulse-dot 1s infinite;
}

/* Green static dot for DONE */
.dot-done {
  background: #22c55e;
}

/* Gray static dot for TODO */
.dot-todo {
  background: #4a5070;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(1.4); }
}
```

---

### 5. SCANNING LINE (top border animation on running node)

Add a `::before` pseudo-element to `.state-running` node:

```css
.gnode.state-running::before {
  content: '';
  position: absolute;
  top: -1px; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, #f59e0b 40%, #8b5cf6 70%, transparent);
  border-radius: 2px 2px 0 0;
  animation: scan-line 2s ease-in-out infinite;
}

@keyframes scan-line {
  0%   { transform: scaleX(0); transform-origin: left;  opacity: 1; }
  50%  { transform: scaleX(1); transform-origin: left;  opacity: 1; }
  51%  { transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; opacity: 0.3; }
}
```

---

### 6. STATE TRANSITIONS (JavaScript logic)

Implement a `setNodeState(nodeId, state, data)` function:

```js
/**
 * @param {string} nodeId - DOM id of the node element
 * @param {'todo'|'running'|'done'} state
 * @param {object} data
 *   For 'running': { currentStage: 0|1|2|3, progress: 0-100, completedStages: [{name, tokens, time}] }
 *   For 'done':    { duration: '12s', cost: '$0.0009', tokensIn: 847, tokensOut: 892 }
 */
function setNodeState(nodeId, state, data) { ... }
```

When transitioning `todo → running`:
1. Add class `state-running`, remove `state-todo`
2. Expand stages section with `max-height` animation
3. Set `currentStage` to `stage-running`, previous stages to `stage-done`, rest to `stage-pending`
4. Start progress bar animation

When transitioning `running → done`:
1. Collapse stages with reverse animation
2. After collapse completes, replace with done summary row
3. Swap classes to `state-done`
4. Show: `✓ Completed in {duration} · {cost}`

---

### 7. DONE NODE COLLAPSED VIEW

When `state-done`, the node body (below title) shows only:

```
✓  Completed in 12s · $0.0009        892 tk ↓
```

- Checkmark in green
- Text in `#6b7090`
- Token count right-aligned in muted color
- Font: monospace 10px
- Background: `rgba(34,197,94,0.04)`
- Border-radius: `6px`
- Padding: `5px 8px`

---

### 8. GRAPH EDGES

For edges between nodes (SVG paths or divs):

`edge-done` (between two done nodes):
- Stroke: `rgba(34,197,94,0.5)`
- No animation

`edge-active` (from done node into running node):
- Stroke: `#4f7ef8`
- Animated dashes flowing toward the running node:
  ```css
  stroke-dasharray: 6 14;
  animation: dash-flow 0.6s linear infinite;
  @keyframes dash-flow { to { stroke-dashoffset: -20; } }
  ```

`edge-pending` (between todo nodes):
- Stroke: `#1e2235`
- No animation

---

### 9. CSS VARIABLES to use throughout

```css
:root {
  --node-bg:        #10131d;
  --node-border:    #252840;
  --node-running:   #f59e0b;
  --node-done:      #22c55e;
  --node-todo:      #4a5070;
  --edge-done:      rgba(34, 197, 94, 0.5);
  --edge-active:    #4f7ef8;
  --edge-pending:   #1e2235;
  --stage-done-bg:  rgba(34, 197, 94, 0.06);
  --stage-run-bg:   rgba(245, 158, 11, 0.07);
  --purple:         #8b5cf6;
  --text:           #d4d8f0;
  --muted:          #4a5070;
  --muted2:         #6b7090;
  --mono:           'IBM Plex Mono', monospace;
}
```

---

### 10. FULL HTML STRUCTURE of one node (reference)

```html
<div class="gnode state-running" id="task-123">
  <!-- Scanning line via ::before pseudo-element -->

  <!-- Node header -->
  <div class="gnode-header">
    <div class="gnode-title">Реализовать HTML5 страницу с приветствием</div>
    <div class="gnode-dot dot-running"></div>
  </div>

  <!-- Stages (only visible in state-running) -->
  <div class="gnode-stages">
    <div class="gnode-stage stage-done">
      <span class="stage-icon">✓</span>
      <span class="stage-name">generate_prompt()</span>
      <span class="stage-meta">847 tk</span>
    </div>
    <div class="gnode-stage stage-running">
      <div class="mini-spinner"></div>
      <span class="stage-name">call_llm()</span>
      <span class="stage-meta blink">· streaming...</span>
    </div>
    <div class="gnode-stage stage-pending">
      <span class="stage-icon">○</span>
      <span class="stage-name">write_report()</span>
    </div>
    <div class="gnode-stage stage-pending">
      <span class="stage-icon">○</span>
      <span class="stage-name">save_files()</span>
    </div>
  </div>

  <!-- Progress bar (only in state-running) -->
  <div class="gnode-progress">
    <div class="gnode-progress-fill" style="width: 45%"></div>
  </div>
  <div class="gnode-progress-labels">
    <span>45%</span>
    <span>~12s</span>
  </div>
</div>
```

---

### What NOT to do
- Do not use any external animation libraries
- Do not use inline styles for animation — all via CSS classes
- Do not break existing graph layout/positioning logic
- Do not change node dimensions in `state-todo` (only `state-running` expands)
- Keep node `position: absolute` as-is for graph canvas positioning