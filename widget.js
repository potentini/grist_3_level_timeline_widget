(function () {
  const ZOOMS = {
    day: { key: "day", spanDays: 21 },
    week: { key: "week", spanDays: 56 },
    month: { key: "month", spanDays: 365 },
    year: { key: "year", spanDays: 365 * 3 },
    all: { key: "all", spanDays: null }
  };

  const PALETTE = [
    "#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7",
    "#56B4E9", "#F0E442", "#111827", "#4C9A2A", "#8B5CF6",
    "#0EA5E9", "#DC2626"
  ];

  const LEVELS = [
    { key: "level1", level: 1, label: "Niveau 1", required: true },
    { key: "level2", level: 2, label: "Niveau 2", required: false },
    { key: "level3", level: 3, label: "Niveau 3", required: false }
  ];

  const LEVEL_ALIASES = {
    1: {
      name: ["level1Name"],
      start: ["level1Start"],
      end: ["level1End"],
      status: ["level1Status"],
      responsible: ["level1Responsible"],
      progress: ["level1Progress"],
      sourceTable: ["level1SourceTableId"],
      sourceRow: ["level1SourceRowId"],
      sourceStartCol: ["level1StartColId"],
      sourceEndCol: ["level1EndColId"],
      sourceProgressCol: ["level1ProgressColId"]
    },
    2: {
      name: ["level2Name"],
      start: ["level2Start"],
      end: ["level2End"],
      status: ["level2Status"],
      responsible: ["level2Responsible"],
      progress: ["level2Progress"],
      sourceTable: ["level2SourceTableId"],
      sourceRow: ["level2SourceRowId"],
      sourceStartCol: ["level2StartColId"],
      sourceEndCol: ["level2EndColId"],
      sourceProgressCol: ["level2ProgressColId"]
    },
    3: {
      name: ["level3Name"],
      start: ["level3Start"],
      end: ["level3End"],
      status: ["level3Status"],
      responsible: ["level3Responsible"],
      progress: ["level3Progress"],
      sourceTable: ["level3SourceTableId"],
      sourceRow: ["level3SourceRowId"],
      sourceStartCol: ["level3StartColId"],
      sourceEndCol: ["level3EndColId"],
      sourceProgressCol: ["level3ProgressColId"]
    }
  };

  const FIELD_LABELS = {
    level: "Niveau",
    name: "Nom",
    start: "Début",
    end: "Fin",
    status: "Statut",
    responsible: "Responsable",
    progress: "Avancement",
    sourceTable: "Table source"
  };

  const TODAY_POSITION_RATIO = 1 / 10;
  const NAVIGATION_STEP_RATIO = 1 / 24;
  const DAY_VIEW_CELL_WIDTH = 32;

  let zoomMode = "day";
  let allRecords = [];
  let treeRoots = [];
  let flatTracks = [];
  let nodeById = new Map();
  let expandedNodes = {};
  let globalMinDate = null;
  let globalMaxDate = null;
  let visibleStart = null;
  let visibleEnd = null;
  let colorField = "level";
  let labelsVisible = true;
  let compactChildren = false;
  let allowTimelineDateEdit = false;
  let currentTableId = null;
  let currentMappingsOk = false;
  let latestMappings = null;
  let latestWriteSummary = "selectedTable.update";

  const STORAGE_KEY = "grist_gantt_multilevel_state_v1";

  const mappingInfoEl = document.getElementById("mappingInfo");
  const debugStatusEl = document.getElementById("debugStatus");
  const debugSyncModeEl = document.getElementById("debugSyncMode");
  const debugActionEl = document.getElementById("debugAction");
  const taskListEl = document.getElementById("taskList");
  const timelineGridEl = document.getElementById("timelineGrid");
  const yearsRowEl = document.getElementById("yearsRow");
  const monthsRowEl = document.getElementById("monthsRow");
  const weeksRowEl = document.getElementById("weeksRow");
  const daysRowEl = document.getElementById("daysRow");
  const timelineHeaderEl = document.getElementById("timelineHeader");
  const timelineBodyEl = document.getElementById("timelineBody");
  const currentPeriodEl = document.getElementById("currentPeriod");
  const colorFieldSelect = document.getElementById("colorFieldSelect");
  const toastContainer = document.getElementById("toastContainer");
  const tooltipEl = document.getElementById("tooltip");
  const ttStartEl = document.getElementById("ttStart");
  const ttEndEl = document.getElementById("ttEnd");
  const ttExtraEl = document.getElementById("ttExtra");
  const dragBubbleEl = document.getElementById("dragBubble");
  const taskCountEl = document.getElementById("taskCount");
  const expandAllBtn = document.getElementById("expandAllBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const todayBtn = document.getElementById("todayBtn");
  const toggleSidebarBtn = document.getElementById("toggleSidebarBtn");
  const toggleLabelsBtn = document.getElementById("toggleLabelsBtn");
  const groupChildrenBtn = document.getElementById("groupChildrenBtn");
  const toggleDateEditBtn = document.getElementById("toggleDateEditBtn");
  const ganttContainer = document.getElementById("ganttContainer");
  const toggleMappingPanelBtn = document.getElementById("toggleMappingPanelBtn");
  const mappingPanelEl = document.getElementById("mappingPanel");
  const debugPanelEl = document.getElementById("debugPanel");

  const dragState = {
    active: false,
    type: null,
    bar: null,
    milestone: null,
    nodeId: null,
    originalStart: null,
    originalEnd: null,
    originalMilestoneDate: null,
    startX: 0,
    pxPerDay: 0
  };

  function setDebugStatus(message) {
    if (debugStatusEl) debugStatusEl.textContent = message;
  }

  function setDebugAction(message) {
    if (debugActionEl) debugActionEl.textContent = message;
  }

  function setDebugSyncMode(message) {
    latestWriteSummary = message;
    if (debugSyncModeEl) debugSyncModeEl.textContent = message;
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.zoomMode) zoomMode = s.zoomMode;
      if (s.colorField) colorField = s.colorField;
      if (typeof s.labelsVisible === "boolean") labelsVisible = s.labelsVisible;
      if (typeof s.compactChildren === "boolean") compactChildren = s.compactChildren;
      if (typeof s.allowTimelineDateEdit === "boolean") allowTimelineDateEdit = s.allowTimelineDateEdit;
      if (s.expandedNodes && typeof s.expandedNodes === "object") expandedNodes = s.expandedNodes;
      if (s.visibleStart) visibleStart = normalizeDate(s.visibleStart);
      if (s.visibleEnd) visibleEnd = normalizeDate(s.visibleEnd);
    } catch (e) {
      console.warn("Impossible de charger l’état persistant :", e);
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        zoomMode,
        colorField,
        labelsVisible,
        compactChildren,
        allowTimelineDateEdit,
        expandedNodes,
        visibleStart: visibleStart ? toGristDateString(visibleStart) : null,
        visibleEnd: visibleEnd ? toGristDateString(visibleEnd) : null
      }));
    } catch (e) {
      console.warn("Impossible de sauvegarder l’état persistant :", e);
    }
  }

  loadState();

  function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof value === "number") {
      const d = new Date(value * 1000);
      return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function addMonths(date, n) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return d;
  }

  function diffInDays(a, b) {
    const da = normalizeDate(a);
    const db = normalizeDate(b);
    return Math.round((db - da) / 86400000);
  }

  function startOfYear(date) { return new Date(date.getFullYear(), 0, 1); }
  function endOfYear(date) { return new Date(date.getFullYear(), 11, 31); }
  function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
  function isSameDay(a, b) { return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  function formatDate(d) {
    if (!d) return "–";
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  }

  function formatDateShort(d) {
    if (!d) return "–";
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  }

  function toGristDateString(d) {
    if (!d) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function isoWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  function cleanRecordForUpdate(obj) {
    const out = {};
    for (const [key, value] of Object.entries(obj || {})) {
      if (value !== undefined && key !== "id") out[key] = value;
    }
    return out;
  }

  function hashStringToInt(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function showToast(message, type = "info") {
    if (!toastContainer) return;
    const el = document.createElement("div");
    el.className = "toast " + (type === "success" ? "success" : type === "error" ? "error" : "");
    el.textContent = message;
    toastContainer.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function showDragBubble(html, x, y) {
    if (!dragBubbleEl) return;
    dragBubbleEl.innerHTML = html;
    dragBubbleEl.style.left = x + "px";
    dragBubbleEl.style.top = y + "px";
    dragBubbleEl.classList.add("visible");
  }

  function hideDragBubble() {
    if (dragBubbleEl) dragBubbleEl.classList.remove("visible");
  }

  function coalesce(...values) {
    for (const value of values) {
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
    return null;
  }

  function mappedEntry(mapped, aliases) {
    for (const alias of aliases || []) {
      if (Object.prototype.hasOwnProperty.call(mapped, alias) && mapped[alias] !== undefined && mapped[alias] !== null && String(mapped[alias]).trim() !== "") {
        return { alias, value: mapped[alias] };
      }
    }
    return { alias: null, value: null };
  }

  function mappedValue(mapped, aliases) {
    return mappedEntry(mapped, aliases).value;
  }

  function hasLevelSpecificSource(sourceEntries, level) {
    return !!(sourceEntries?.rowId?.alias && sourceEntries.rowId.alias.startsWith(`level${level}`));
  }

  function isGristList(value) {
    return Array.isArray(value) && value[0] === "L";
  }

  function looksLikeSingleRefTuple(value) {
    return Array.isArray(value) && value.length >= 1 && value.length <= 3 && !isGristList(value) && !Array.isArray(value[0]) &&
      !(typeof value[0] === "object" && value[0] !== null) &&
      (value.length === 1 || value[1] == null || typeof value[1] === "string") &&
      (value.length < 3 || value[2] == null || typeof value[2] === "string");
  }

  function splitListValue(value) {
    if (!Array.isArray(value)) return [value];
    if (!value.length) return [];
    if (isGristList(value)) return value.slice(1);
    if (looksLikeSingleRefTuple(value)) return [value];
    if (Array.isArray(value[0]) || (typeof value[0] === "object" && value[0] !== null)) return value;
    return value;
  }

  function valueAtListIndex(value, index, listLength) {
    if (value == null || listLength <= 1) return value;
    const values = splitListValue(value);
    if (values.length === listLength) return values[index];
    return value;
  }

  function parseRefValue(value) {
    if (value == null) return { label: "", rowId: null, tableId: null };
    if (Array.isArray(value)) {
      if (!value.length) return { label: "", rowId: null, tableId: null };
      if (isGristList(value)) return parseRefValue(value[1]);
      if (Array.isArray(value[0]) || (typeof value[0] === "object" && value[0] !== null)) return parseRefValue(value[0]);
      const rowId = Number(value[0]);
      return {
        label: value[1] != null ? String(value[1]) : String(value[0] ?? ""),
        rowId: Number.isFinite(rowId) ? rowId : null,
        tableId: value[2] != null ? String(value[2]) : null
      };
    }
    if (typeof value === "object") {
      const rowId = Number(value.id ?? value.rowId ?? value.Ref ?? value.ref);
      const label = value.label ?? value.name ?? value.displayValue ?? value.value ?? value.title ?? value.id ?? "";
      const tableId = value.tableId ?? value.table ?? value.tableName ?? null;
      return { label: String(label || ""), rowId: Number.isFinite(rowId) ? rowId : null, tableId: tableId ? String(tableId) : null };
    }
    return { label: String(value), rowId: Number.isFinite(Number(value)) ? Number(value) : null, tableId: null };
  }

  function parseRefValues(value) {
    return splitListValue(value).map(parseRefValue).filter((ref) => (ref.label || "").trim());
  }

  function parseProgress(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string") {
      const cleaned = value.replace("%", "").replace(",", ".").trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      if (!Number.isFinite(n)) return null;
      return Math.max(0, Math.min(100, n <= 1 && !value.includes("%") ? n * 100 : n));
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.min(100, n <= 1 ? n * 100 : n));
  }

  function makeNodeId(level, parts, refInfo, source, sourceEntries) {
    const pathId = `L${level}:path:${parts.map((p) => String(p || "").trim()).join("›")}`;
    const hasStableLevelSource = hasLevelSpecificSource(sourceEntries, level);
    if (hasStableLevelSource && source.tableId && source.rowId != null) return `L${level}:src:${source.tableId}:${source.rowId}`;
    if (refInfo && refInfo.tableId && refInfo.rowId != null) return `L${level}:ref:${refInfo.tableId}:${refInfo.rowId}`;
    if (refInfo && refInfo.rowId != null) return `L${level}:ref:${refInfo.rowId}`;
    return pathId;
  }

  function normalizedHierarchyLabel(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr");
  }

  function groupingKey(node) {
    return `${node.level}::${node.parentId || ""}::${normalizedHierarchyLabel(node.label)}`;
  }

  function earliestDate(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a < b ? a : b;
  }

  function latestDate(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return a > b ? a : b;
  }

  function mergeDuplicateNodeData(target, duplicate) {
    for (const rowId of duplicate.rawRows) {
      if (!target.rawRows.includes(rowId)) target.rawRows.push(rowId);
    }
    if (duplicate.sourceIndex < target.sourceIndex) target.sourceIndex = duplicate.sourceIndex;
    if (!target.firstDisplayRowId && duplicate.firstDisplayRowId) target.firstDisplayRowId = duplicate.firstDisplayRowId;

    target.startDate = earliestDate(target.startDate, duplicate.startDate);
    target.endDate = latestDate(target.endDate, duplicate.endDate);
    target.explicitDates = target.explicitDates || duplicate.explicitDates;
    if (!target.status && duplicate.status) target.status = duplicate.status;
    if (!target.responsible && duplicate.responsible) target.responsible = duplicate.responsible;
    if (target.progress == null && duplicate.progress != null) target.progress = duplicate.progress;
    if (target.order == null || (duplicate.order != null && duplicate.order < target.order)) target.order = duplicate.order;

    target.source = {
      tableId: target.source.tableId || duplicate.source.tableId || null,
      rowId: target.source.rowId != null ? target.source.rowId : duplicate.source.rowId,
      startCol: target.source.startCol || duplicate.source.startCol || null,
      endCol: target.source.endCol || duplicate.source.endCol || null,
      progressCol: target.source.progressCol || duplicate.source.progressCol || null
    };
    target.fallbackAliases = target.fallbackAliases || duplicate.fallbackAliases;
  }

  function dedupeHierarchySiblings(siblings, nodes) {
    const unique = [];
    const byKey = new Map();

    for (const node of siblings) {
      const key = groupingKey(node);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, node);
        unique.push(node);
        continue;
      }

      mergeDuplicateNodeData(existing, node);
      for (const child of node.children) {
        child.parentId = existing.id;
        existing.children.push(child);
      }
      nodes.delete(node.id);
    }

    for (const node of unique) {
      node.children = dedupeHierarchySiblings(node.children, nodes);
    }

    return unique;
  }

  function createEmptyNode({ id, level, label, parentId, sourceIndex, sourceRowId, source }) {
    return {
      id,
      level,
      label: label || `(Niveau ${level} sans nom)`,
      parentId: parentId || null,
      children: [],
      sourceIndex,
      firstDisplayRowId: sourceRowId,
      startDate: null,
      endDate: null,
      aggStart: null,
      aggEnd: null,
      explicitDates: false,
      isMilestone: false,
      milestoneDate: null,
      status: "",
      responsible: "",
      progress: null,
      order: null,
      source: source || {},
      fallbackAliases: {},
      rawRows: []
    };
  }

  function mergeNodeData(node, data) {
    if (!node.rawRows.includes(data.displayRowId)) node.rawRows.push(data.displayRowId);
    if (data.sourceIndex < node.sourceIndex) node.sourceIndex = data.sourceIndex;
    if (!node.firstDisplayRowId && data.displayRowId) node.firstDisplayRowId = data.displayRowId;

    if (data.startDate || data.endDate) {
      node.startDate = data.startDate || node.startDate;
      node.endDate = data.endDate || node.endDate;
      node.explicitDates = true;
    }
    if (!node.status && data.status) node.status = data.status;
    if (!node.responsible && data.responsible) node.responsible = data.responsible;
    if (node.progress == null && data.progress != null) node.progress = data.progress;
    if (node.order == null && data.order != null) node.order = data.order;

    node.source = {
      tableId: node.source.tableId || data.source.tableId || null,
      rowId: node.source.rowId != null ? node.source.rowId : data.source.rowId,
      startCol: node.source.startCol || data.source.startCol || null,
      endCol: node.source.endCol || data.source.endCol || null,
      progressCol: node.source.progressCol || data.source.progressCol || null
    };
    node.fallbackAliases = data.fallbackAliases || node.fallbackAliases;
  }

  function buildLogicalRecords(records) {
    const nodes = new Map();
    const roots = [];
    for (const [idx, raw] of (records || []).entries()) {
      if (!raw) continue;
      const mapped = grist.mapColumnNames(raw, { mappings: latestMappings });
      if (!mapped) continue;

      const displayRowId = raw.id || raw.Id || raw.ID;

      function addLevel(levelIndex, parentId, pathLabels) {
        if (levelIndex >= LEVELS.length) return;

        const levelInfo = LEVELS[levelIndex];
        const level = levelInfo.level;
        const cfg = LEVEL_ALIASES[level];
        const nameValue = mappedValue(mapped, cfg.name);
        const refs = parseRefValues(nameValue);

        if (!refs.length) {
          if (!levelInfo.required) addLevel(levelIndex + 1, parentId, pathLabels);
          return;
        }

        const sourceEntries = {
          tableId: mappedEntry(mapped, cfg.sourceTable),
          rowId: mappedEntry(mapped, cfg.sourceRow),
          startCol: mappedEntry(mapped, cfg.sourceStartCol),
          endCol: mappedEntry(mapped, cfg.sourceEndCol),
          progressCol: mappedEntry(mapped, cfg.sourceProgressCol)
        };

        refs.forEach((ref, refIndex) => {
          const label = (ref.label || "").trim();
          if (!label) return;

          const branchPathLabels = [...pathLabels, label];
          const sourceRowValues = splitListValue(sourceEntries.rowId.value);
          const rowIdValue = refs.length <= 1 || sourceRowValues.length === refs.length
            ? valueAtListIndex(sourceEntries.rowId.value, refIndex, refs.length)
            : null;
          const source = {
            tableId: coalesce(sourceEntries.tableId.value, ref.tableId),
            rowId: Number(coalesce(rowIdValue, ref.rowId)) || null,
            startCol: sourceEntries.startCol.value,
            endCol: sourceEntries.endCol.value,
            progressCol: sourceEntries.progressCol.value
          };
          const nodeId = makeNodeId(level, branchPathLabels, ref, source, sourceEntries);

          if (!nodes.has(nodeId)) {
            const node = createEmptyNode({
              id: nodeId,
              level,
              label,
              parentId,
              sourceIndex: idx,
              sourceRowId: displayRowId,
              source
            });
            nodes.set(nodeId, node);
            if (parentId && nodes.has(parentId)) nodes.get(parentId).children.push(node);
            else roots.push(node);
          }

          const startDate = normalizeDate(valueAtListIndex(mappedValue(mapped, cfg.start), refIndex, refs.length));
          const endDate = normalizeDate(valueAtListIndex(mappedValue(mapped, cfg.end), refIndex, refs.length));
          mergeNodeData(nodes.get(nodeId), {
            displayRowId,
            sourceIndex: idx,
            startDate,
            endDate,
            status: String(valueAtListIndex(mappedValue(mapped, cfg.status), refIndex, refs.length) || ""),
            responsible: String(valueAtListIndex(mappedValue(mapped, cfg.responsible), refIndex, refs.length) || ""),
            progress: parseProgress(valueAtListIndex(mappedValue(mapped, cfg.progress), refIndex, refs.length)),
            source,
            fallbackAliases: { start: cfg.start[0], end: cfg.end[0], progress: cfg.progress[0] }
          });

          addLevel(levelIndex + 1, nodeId, branchPathLabels);
        });
      }

      addLevel(0, null, []);
    }

    function finalize(node) {
      let min = node.startDate || null;
      let max = node.endDate || node.startDate || null;
      node.children.sort(sortNodes);
      for (const child of node.children) {
        finalize(child);
        if (child.aggStart && (!min || child.aggStart < min)) min = child.aggStart;
        if (child.aggEnd && (!max || child.aggEnd > max)) max = child.aggEnd;
        if (!node.status && child.status) node.status = child.status;
        if (!node.responsible && child.responsible) node.responsible = child.responsible;
      }
      node.aggStart = node.startDate || min;
      node.aggEnd = node.endDate || max || min;
      node.isMilestone = !node.startDate && !!node.endDate;
      node.milestoneDate = node.isMilestone ? node.endDate : null;
      return node;
    }

    const dedupedRoots = dedupeHierarchySiblings(roots, nodes);
    dedupedRoots.sort(sortNodes).forEach(finalize);
    nodeById = nodes;
    allRecords = Array.from(nodes.values());
    treeRoots = dedupedRoots;
    return allRecords;
  }

  function sortNodes(a, b) {
    const ao = a.order != null ? a.order : Infinity;
    const bo = b.order != null ? b.order : Infinity;
    if (ao !== bo) return ao - bo;
    return (a.sourceIndex ?? Infinity) - (b.sourceIndex ?? Infinity) || a.label.localeCompare(b.label, "fr");
  }

  function computeGlobalRange(nodes) {
    let min = null;
    let max = null;
    for (const n of nodes) {
      for (const d of [n.startDate, n.endDate, n.aggStart, n.aggEnd, n.milestoneDate]) {
        if (!d) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
    }
    return { min, max };
  }

  function isNodeExpanded(node) {
    if (!node.children.length) return false;
    return expandedNodes[node.id] !== false;
  }

  function buildTracks() {
    const tracks = [];
    function walk(node) {
      tracks.push({ kind: "node", node });
      if (!isNodeExpanded(node)) return;
      if (compactChildren && node.children.length && node.children.every((c) => !c.children.length)) {
        tracks.push({ kind: "compact", parent: node, nodes: node.children });
      } else {
        node.children.forEach(walk);
      }
    }
    treeRoots.forEach(walk);
    flatTracks = tracks;
    return tracks;
  }

  function getNavigationBounds() {
    if (!globalMinDate || !globalMaxDate) return { minAllowed: null, maxAllowed: null };
    const today = normalizeDate(new Date());
    const minDate = today && today < globalMinDate ? today : globalMinDate;
    const maxDate = today && today > globalMaxDate ? today : globalMaxDate;
    if (zoomMode === "all") {
      return {
        minAllowed: new Date(minDate.getFullYear() - 2, 0, 1),
        maxAllowed: new Date(maxDate.getFullYear() + 2, 11, 31)
      };
    }
    const fullSpan = diffInDays(minDate, maxDate) + 1;
    const requested = ZOOMS[zoomMode]?.spanDays || fullSpan;
    const marginDays = Math.max(15, requested);
    return { minAllowed: addDays(minDate, -marginDays), maxAllowed: addDays(maxDate, marginDays) };
  }

  function positionRangeAroundToday(span) {
    const today = normalizeDate(new Date());
    const daysBeforeToday = Math.floor(span * TODAY_POSITION_RATIO);
    const start = addDays(today, -daysBeforeToday);
    return { start, end: addDays(start, span - 1) };
  }

  function setAllZoomRangeAroundToday() {
    const today = normalizeDate(new Date());
    const minDate = today && today < globalMinDate ? today : globalMinDate;
    const maxDate = today && today > globalMaxDate ? today : globalMaxDate;
    const daysBeforeData = Math.max(0, diffInDays(minDate, today));
    const daysAfterData = Math.max(0, diffInDays(today, maxDate));
    const minSpanForTodayOffset = Math.ceil((daysBeforeData + 1) / TODAY_POSITION_RATIO);
    const minSpanForDataAfterToday = Math.ceil((daysAfterData + 1) / (1 - TODAY_POSITION_RATIO));
    const dataSpan = diffInDays(minDate, maxDate) + 1;
    const span = Math.max(dataSpan, minSpanForTodayOffset, minSpanForDataAfterToday, 30);
    const range = positionRangeAroundToday(span);
    visibleStart = range.start;
    visibleEnd = range.end;
  }

  function getTimelineAvailableWidth() {
    return timelineBodyEl?.clientWidth || timelineHeaderEl?.clientWidth || 800;
  }

  function getDayZoomSpan() {
    return Math.max(1, Math.floor(getTimelineAvailableWidth() / DAY_VIEW_CELL_WIDTH));
  }

  function getZoomSpan() {
    if (zoomMode === "day") return getDayZoomSpan();
    return ZOOMS[zoomMode]?.spanDays || 30;
  }

  function setVisibleRangeForZoom() {
    if (!globalMinDate || !globalMaxDate) {
      visibleStart = null;
      visibleEnd = null;
      return;
    }
    if (zoomMode === "all") {
      setAllZoomRangeAroundToday();
      return;
    }
    const span = getZoomSpan();
    const range = positionRangeAroundToday(span);
    let start = range.start;
    let end = range.end;
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (start < minAllowed) { start = new Date(minAllowed.getTime()); end = addDays(start, span - 1); }
    if (end > maxAllowed) { end = new Date(maxAllowed.getTime()); start = addDays(end, -span + 1); }
    visibleStart = start;
    visibleEnd = end;
  }

  function keepOrRecomputeVisibleRange() {
    if (!visibleStart || !visibleEnd) return setVisibleRangeForZoom();
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (!minAllowed || !maxAllowed) return setVisibleRangeForZoom();
    const span = zoomMode === "day" ? getDayZoomSpan() : diffInDays(visibleStart, visibleEnd) + 1;
    let start = new Date(visibleStart.getTime());
    let end = addDays(start, span - 1);
    if (start < minAllowed) { start = new Date(minAllowed.getTime()); end = addDays(start, span - 1); }
    if (end > maxAllowed) { end = new Date(maxAllowed.getTime()); start = addDays(end, -span + 1); }
    visibleStart = start;
    visibleEnd = end;
  }

  function getNavigationStepMonths() {
    if (zoomMode === "month") return 1;
    if (zoomMode === "year" || zoomMode === "all") return 3;
    return 0;
  }

  function shiftVisibleRange(direction) {
    if (!visibleStart || !visibleEnd) return;
    const span = diffInDays(visibleStart, visibleEnd) + 1;
    const monthStep = getNavigationStepMonths();
    if (monthStep) {
      visibleStart = addMonths(visibleStart, direction === "left" ? -monthStep : monthStep);
      visibleEnd = addDays(visibleStart, span - 1);
    } else {
      const step = Math.max(1, Math.round(span * NAVIGATION_STEP_RATIO));
      const delta = direction === "left" ? -step : step;
      visibleStart = addDays(visibleStart, delta);
      visibleEnd = addDays(visibleEnd, delta);
    }
    const { minAllowed, maxAllowed } = getNavigationBounds();
    if (visibleStart < minAllowed) { visibleStart = new Date(minAllowed.getTime()); visibleEnd = addDays(visibleStart, span - 1); }
    if (visibleEnd > maxAllowed) { visibleEnd = new Date(maxAllowed.getTime()); visibleStart = addDays(visibleEnd, -span + 1); }
    saveState();
    render();
  }

  function recomputeCellWidth(totalDays) {
    const bodyWidth = getTimelineAvailableWidth();
    let cellWidth = 32;
    if (zoomMode === "day") cellWidth = DAY_VIEW_CELL_WIDTH;
    else if (zoomMode === "all") cellWidth = Math.max(2, Math.min(18, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "year") cellWidth = Math.max(3, Math.min(10, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "month") cellWidth = Math.max(9, Math.min(24, Math.floor(bodyWidth / Math.max(1, totalDays))));
    else if (zoomMode === "week") cellWidth = Math.max(16, Math.min(32, Math.floor(bodyWidth / Math.max(1, totalDays))));
    document.documentElement.style.setProperty("--cell-width", cellWidth + "px");
    return { cellWidth, containerWidth: totalDays * cellWidth };
  }

  function updateZoomButtons() {
    document.querySelectorAll(".zoom-controls .btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.zoom === zoomMode));
  }

  function initColorFieldSelect() {
    const fields = ["level", "name", "status", "responsible", "progress", "sourceTable", "start", "end"];
    colorFieldSelect.innerHTML = "";
    for (const f of fields) {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = FIELD_LABELS[f] || f;
      colorFieldSelect.appendChild(opt);
    }
    if (!fields.includes(colorField)) colorField = fields[0];
    colorFieldSelect.value = colorField;
  }

  function colorValue(node) {
    if (colorField === "level") return `Niveau ${node.level}`;
    if (colorField === "name") return node.label;
    if (colorField === "status") return node.status;
    if (colorField === "responsible") return node.responsible;
    if (colorField === "progress") return node.progress == null ? "" : `${Math.round(node.progress)}%`;
    if (colorField === "sourceTable") return node.source.tableId || "";
    if (colorField === "start") return node.aggStart ? toGristDateString(node.aggStart) : "";
    if (colorField === "end") return node.aggEnd ? toGristDateString(node.aggEnd) : "";
    return node.label;
  }

  function getColorForNode(node) {
    if (colorField === "level") return node.level === 1 ? "#4f46e5" : node.level === 2 ? "#0ea5e9" : "#10b981";
    if (colorField === "status") {
      const s = String(node.status || "").trim().toLowerCase();
      if (["terminé", "termine", "done", "clos", "clôturé", "cloture"].includes(s)) return "#10b981";
      if (["en cours", "ongoing", "started"].includes(s)) return "#3b82f6";
      if (["bloqué", "bloque", "blocked"].includes(s)) return "#ef4444";
      if (["à faire", "a faire", "todo", "non démarré", "non demarre"].includes(s)) return "#64748b";
    }
    return PALETTE[hashStringToInt(colorValue(node)) % PALETTE.length];
  }

  function buildHeaders() {
    for (const el of [yearsRowEl, monthsRowEl, weeksRowEl, daysRowEl]) {
      el.innerHTML = "";
      el.style.display = "none";
      el.style.gridTemplateColumns = "";
      el.style.position = "";
      el.style.width = "";
      el.style.height = "";
    }
    if (!visibleStart || !visibleEnd) return;
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    if (totalDays <= 0) return;
    const { containerWidth } = recomputeCellWidth(totalDays);
    const dates = Array.from({ length: totalDays }, (_, i) => addDays(visibleStart, i));
    const today = normalizeDate(new Date());

    if (zoomMode === "all") {
      yearsRowEl.style.display = "block";
      yearsRowEl.style.position = "relative";
      yearsRowEl.style.width = containerWidth + "px";
      yearsRowEl.style.height = "24px";
      for (let y = visibleStart.getFullYear(); y <= visibleEnd.getFullYear(); y++) {
        const segStart = y === visibleStart.getFullYear() ? visibleStart : startOfYear(new Date(y, 0, 1));
        const segEnd = y === visibleEnd.getFullYear() ? visibleEnd : endOfYear(new Date(y, 0, 1));
        const cell = document.createElement("div");
        cell.className = "time-cell";
        cell.textContent = String(y);
        cell.style.position = "absolute";
        cell.style.left = ((diffInDays(visibleStart, segStart) / totalDays) * containerWidth) + "px";
        cell.style.width = (((diffInDays(segStart, segEnd) + 1) / totalDays) * containerWidth) + "px";
        cell.style.height = "24px";
        cell.style.display = "flex";
        cell.style.alignItems = "center";
        cell.style.justifyContent = "center";
        yearsRowEl.appendChild(cell);
      }
    } else if (zoomMode === "year") {
      monthsRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => d.getMonth(), (d) => String(d.getMonth() + 1).padStart(2, "0"));
    } else if (zoomMode === "month") {
      monthsRowEl.style.display = "grid";
      weeksRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = weeksRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }));
      addSegmentedHeader(weeksRowEl, dates, (d) => `${d.getFullYear()}-${isoWeekNumber(d)}`, (d) => "S" + isoWeekNumber(d).toString().padStart(2, "0"));
    } else {
      monthsRowEl.style.display = "grid";
      daysRowEl.style.display = "grid";
      monthsRowEl.style.gridTemplateColumns = daysRowEl.style.gridTemplateColumns = `repeat(${totalDays}, var(--cell-width))`;
      addSegmentedHeader(monthsRowEl, dates, (d) => `${d.getFullYear()}-${d.getMonth()}`, (d) => d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" }));
      for (const d of dates) {
        const cell = document.createElement("div");
        cell.className = "time-cell" + (isWeekend(d) ? " weekend" : "") + (isSameDay(d, today) ? " today" : "");
        cell.textContent = d.getDate().toString().padStart(2, "0");
        daysRowEl.appendChild(cell);
      }
    }
    currentPeriodEl.textContent = `${formatDate(visibleStart)} – ${formatDate(visibleEnd)}`;
  }

  function addSegmentedHeader(el, dates, keyFn, labelFn) {
    let start = 0;
    let current = keyFn(dates[0]);
    for (let i = 0; i < dates.length; i++) {
      const isLast = i === dates.length - 1;
      const next = !isLast ? keyFn(dates[i + 1]) : null;
      if (isLast || next !== current) {
        const cell = document.createElement("div");
        cell.className = "time-cell";
        cell.textContent = labelFn(dates[i]);
        cell.style.gridColumn = `${start + 1} / ${i + 2}`;
        el.appendChild(cell);
        start = i + 1;
        current = next;
      }
    }
  }

  function buildSidebarMeta(node) {
    const parts = [];
    if (node.aggStart || node.aggEnd) parts.push(`${formatDateShort(node.aggStart || node.aggEnd)} – ${formatDateShort(node.aggEnd || node.aggStart)}`);
    if (node.status) parts.push(node.status);
    if (node.responsible) parts.push(node.responsible);
    if (node.progress != null) parts.push(`${Math.round(node.progress)}%`);
    if (node.source.tableId) parts.push(`↳ ${node.source.tableId}`);
    return parts.join(" · ");
  }

  function renderTaskList() {
    const tracks = buildTracks();
    taskListEl.innerHTML = "";
    taskCountEl.textContent = `${allRecords.length} élément(s)`;
    if (!tracks.length) {
      taskListEl.innerHTML = '<div class="empty">Aucun élément à afficher.</div>';
      return;
    }

    for (const track of tracks) {
      if (track.kind === "compact") {
        const row = document.createElement("div");
        row.className = `task-row child-row level-${Math.min(3, track.parent.level + 1)} compact-row`;
        row.style.paddingLeft = `${16 + track.parent.level * 18}px`;
        row.innerHTML = `<div class="task-info"><div class="task-name">${track.nodes.length} élément(s) regroupé(s)</div><div class="task-meta">${track.parent.label}</div></div>`;
        taskListEl.appendChild(row);
        continue;
      }

      const node = track.node;
      const row = document.createElement("div");
      row.className = `task-row ${node.children.length ? "parent-row" : "child-row"} level-${node.level}`;
      row.style.paddingLeft = `${8 + (node.level - 1) * 18}px`;
      row.dataset.nodeId = node.id;
      row.dataset.kind = "node";

      const toggle = document.createElement("button");
      toggle.className = "parent-toggle";
      toggle.textContent = node.children.length ? (isNodeExpanded(node) ? "▾" : "▸") : "";
      toggle.disabled = !node.children.length;
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        expandedNodes[node.id] = !isNodeExpanded(node);
        saveState();
        render();
      });

      const info = document.createElement("div");
      info.className = "task-info";
      const main = document.createElement("div");
      main.className = "task-name";
      main.textContent = node.label;
      const meta = document.createElement("div");
      meta.className = "task-meta";
      meta.textContent = buildSidebarMeta(node);
      info.appendChild(main);
      info.appendChild(meta);
      row.appendChild(toggle);
      row.appendChild(info);
      taskListEl.appendChild(row);
    }
  }

  function showTooltip(x, y, node, start, end) {
    if (!tooltipEl) return;
    tooltipEl.querySelector(".tooltip-title").textContent = node.label;
    ttStartEl.textContent = formatDate(start);
    ttEndEl.textContent = formatDate(end);
    const lines = [
      `<div><span>Niveau</span><span>${node.level}</span></div>`,
      node.status ? `<div><span>Statut</span><span>${node.status}</span></div>` : "",
      node.responsible ? `<div><span>Responsable</span><span>${node.responsible}</span></div>` : "",
      node.progress != null ? `<div><span>Avancement</span><span>${Math.round(node.progress)}%</span></div>` : "",
      node.source.tableId ? `<div><span>Source</span><span>${node.source.tableId}#${node.source.rowId || "?"}</span></div>` : ""
    ].filter(Boolean);
    ttExtraEl.innerHTML = lines.join("");
    tooltipEl.classList.add("visible");
    let left = x + 12;
    let top = y + 10;
    tooltipEl.style.left = left + "px";
    tooltipEl.style.top = top + "px";
    const rect = tooltipEl.getBoundingClientRect();
    if (rect.right > window.innerWidth - 12) left = x - rect.width - 12;
    if (rect.bottom > window.innerHeight - 12) top = window.innerHeight - rect.height - 12;
    tooltipEl.style.left = Math.max(12, left) + "px";
    tooltipEl.style.top = Math.max(12, top) + "px";
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove("visible");
  }

  function renderTimeline() {
    timelineGridEl.innerHTML = "";
    if (!visibleStart || !visibleEnd) return;
    const tracks = flatTracks.length ? flatTracks : buildTracks();
    if (!tracks.length) return;
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    if (totalDays <= 0) return;
    const { containerWidth } = recomputeCellWidth(totalDays);
    const rowHeight = 34;
    const totalHeight = tracks.length * rowHeight;
    timelineGridEl.style.width = containerWidth + "px";
    timelineGridEl.style.height = totalHeight + "px";
    timelineGridEl.style.minHeight = totalHeight + "px";
    timelineBodyEl.style.height = totalHeight + "px";
    timelineBodyEl.style.minHeight = totalHeight + "px";

    function dateToFrac(d) {
      if (!d) return null;
      const clamped = d < visibleStart ? visibleStart : d > visibleEnd ? visibleEnd : d;
      return diffInDays(visibleStart, clamped) / totalDays;
    }

    function dateToCenterFrac(d) {
      if (!d) return null;
      const clamped = d < visibleStart ? visibleStart : d > visibleEnd ? visibleEnd : d;
      return (diffInDays(visibleStart, clamped) + 0.5) / totalDays;
    }

    for (let t = 0; t < tracks.length; t++) {
      const row = document.createElement("div");
      row.className = "grid-row";
      row.style.width = containerWidth + "px";
      for (let i = 0; i < totalDays; i++) {
        const d = addDays(visibleStart, i);
        const cell = document.createElement("div");
        cell.className = "grid-cell" + (isWeekend(d) ? " weekend" : "");
        row.appendChild(cell);
      }
      timelineGridEl.appendChild(row);
    }

    const today = normalizeDate(new Date());
    const todayDiff = diffInDays(visibleStart, today);
    if (todayDiff >= 0 && todayDiff < totalDays) {
      const line = document.createElement("div");
      line.className = "today-line";
      line.style.left = (todayDiff * (containerWidth / Math.max(1, totalDays))) + "px";
      timelineGridEl.appendChild(line);
    }

    function addNodeBar(trackIndex, node, hideLabel) {
      const start = node.isMilestone ? node.milestoneDate : (node.startDate || node.aggStart || node.endDate);
      const end = node.isMilestone ? node.milestoneDate : (node.endDate || node.aggEnd || start);
      if (!start || !end || end < visibleStart || start > visibleEnd) return;

      if (node.isMilestone && !node.startDate) {
        const frac = dateToCenterFrac(node.milestoneDate);
        if (frac == null) return;
        const x = frac * containerWidth;
        const centerY = trackIndex * rowHeight + rowHeight / 2;
        const m = document.createElement("div");
        m.className = `gantt-milestone level-${node.level}`;
        m.style.left = x.toFixed(1) + "px";
        m.style.top = centerY.toFixed(1) + "px";
        m.style.background = getColorForNode(node);
        m.dataset.nodeId = node.id;
        m.addEventListener("mousemove", (ev) => showTooltip(ev.clientX, ev.clientY, node, node.milestoneDate, node.milestoneDate));
        m.addEventListener("mouseenter", (ev) => showTooltip(ev.clientX, ev.clientY, node, node.milestoneDate, node.milestoneDate));
        m.addEventListener("mouseleave", hideTooltip);
        attachMilestoneDrag(m);
        timelineGridEl.appendChild(m);
        if (labelsVisible && !hideLabel) {
          const label = document.createElement("span");
          label.className = "milestone-label";
          label.textContent = node.label;
          label.style.left = (x + 18) + "px";
          label.style.top = centerY + "px";
          timelineGridEl.appendChild(label);
        }
        return;
      }

      const s = normalizeDate(start);
      const e = normalizeDate(end);
      const leftFrac = dateToFrac(s);
      const rightFrac = dateToFrac(e);
      if (leftFrac == null || rightFrac == null) return;
      const widthFrac = Math.max(0.01, (rightFrac - leftFrac) + (1 / totalDays));
      const leftPx = leftFrac * containerWidth;
      const widthPx = widthFrac * containerWidth;
      const bar = document.createElement("div");
      bar.className = `gantt-bar level-${node.level}` + (node.children.length ? " parent" : "");
      bar.style.left = leftPx.toFixed(1) + "px";
      bar.style.width = widthPx.toFixed(1) + "px";
      bar.style.top = trackIndex * rowHeight + 8 + "px";
      bar.style.background = getColorForNode(node);
      bar.dataset.nodeId = node.id;
      bar.dataset.start = s.toISOString();
      bar.dataset.end = e.toISOString();
      bar.dataset.explicitDates = node.explicitDates ? "1" : "";
      if (node.progress != null) {
        const progress = document.createElement("span");
        progress.className = "bar-progress";
        progress.style.width = Math.round(node.progress) + "%";
        bar.appendChild(progress);
      }
      if (labelsVisible && !hideLabel) {
        const label = document.createElement("span");
        label.className = widthPx >= 110 ? "bar-label inside" : "bar-label outside";
        label.textContent = node.label;
        bar.appendChild(label);
      }
      bar.addEventListener("mousemove", (ev) => {
        setBarCursor(bar, ev);
        showTooltip(ev.clientX, ev.clientY, node, s, e);
      });
      bar.addEventListener("mouseenter", (ev) => showTooltip(ev.clientX, ev.clientY, node, s, e));
      bar.addEventListener("mouseleave", () => { bar.style.cursor = "default"; hideTooltip(); });
      attachBarDrag(bar);
      timelineGridEl.appendChild(bar);
    }

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      if (track.kind === "node") addNodeBar(i, track.node, false);
      else if (track.kind === "compact") track.nodes.forEach((node) => addNodeBar(i, node, true));
    }
  }

  function setBarCursor(bar, e) {
    const rect = bar.getBoundingClientRect();
    if (e.clientX - rect.left < 8 || rect.right - e.clientX < 8) bar.style.cursor = "ew-resize";
    else bar.style.cursor = "grab";
  }

  function attachBarDrag(bar) {
    bar.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !allowTimelineDateEdit) return;
      const node = nodeById.get(bar.dataset.nodeId);
      if (!node || !node.explicitDates) {
        showToast("Cette barre est agrégée : mappez les dates/source du niveau pour l’éditer.", "error");
        return;
      }
      e.preventDefault();
      hideTooltip();
      const rect = bar.getBoundingClientRect();
      const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
      const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth || rect.width;
      dragState.pxPerDay = containerWidth / Math.max(1, totalDays);
      dragState.active = true;
      dragState.bar = bar;
      dragState.milestone = null;
      dragState.nodeId = node.id;
      dragState.originalStart = normalizeDate(bar.dataset.start);
      dragState.originalEnd = normalizeDate(bar.dataset.end);
      dragState.startX = e.clientX;
      const offsetX = e.clientX - rect.left;
      if (offsetX < 8) dragState.type = "resize-left";
      else if (rect.right - e.clientX < 8) dragState.type = "resize-right";
      else dragState.type = "move";
      showDragBubble(`${formatDate(dragState.originalStart)} → ${formatDate(dragState.originalEnd)}<span class="muted">édition</span>`, e.clientX, rect.top + rect.height / 2);
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });
  }

  function attachMilestoneDrag(m) {
    m.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || !allowTimelineDateEdit) return;
      const node = nodeById.get(m.dataset.nodeId);
      if (!node || !node.source.rowId) return;
      e.preventDefault();
      hideTooltip();
      const rect = m.getBoundingClientRect();
      const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
      const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth || rect.width;
      dragState.pxPerDay = containerWidth / Math.max(1, totalDays);
      dragState.active = true;
      dragState.bar = null;
      dragState.milestone = m;
      dragState.nodeId = node.id;
      dragState.originalMilestoneDate = new Date(node.milestoneDate.getTime());
      dragState.type = "move-milestone";
      dragState.startX = e.clientX;
      showDragBubble(`${formatDate(node.milestoneDate)}<span class="muted">jalon</span>`, e.clientX, rect.top + rect.height / 2);
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });
  }

  function onDragMove(e) {
    if (!dragState.active) return;
    e.preventDefault();
    const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.pxPerDay);
    const totalDays = diffInDays(visibleStart, visibleEnd) + 1;
    const containerWidth = timelineBodyEl.clientWidth || timelineHeaderEl.clientWidth;
    if (!containerWidth || !totalDays) return;

    if (dragState.bar) {
      let newStart = new Date(dragState.originalStart.getTime());
      let newEnd = new Date(dragState.originalEnd.getTime());
      if (dragState.type === "move") {
        newStart = addDays(newStart, deltaDays);
        newEnd = addDays(newEnd, deltaDays);
      } else if (dragState.type === "resize-left") {
        newStart = addDays(newStart, deltaDays);
        if (newStart > newEnd) newStart = new Date(newEnd.getTime());
      } else if (dragState.type === "resize-right") {
        newEnd = addDays(newEnd, deltaDays);
        if (newEnd < newStart) newEnd = new Date(newStart.getTime());
      }
      const leftFrac = diffInDays(visibleStart, newStart) / totalDays;
      const rightFrac = diffInDays(visibleStart, newEnd) / totalDays;
      const widthFrac = Math.max(0.01, (rightFrac - leftFrac) + (1 / totalDays));
      dragState.bar.style.left = (leftFrac * containerWidth).toFixed(1) + "px";
      dragState.bar.style.width = (widthFrac * containerWidth).toFixed(1) + "px";
      dragState.bar.dataset.start = newStart.toISOString();
      dragState.bar.dataset.end = newEnd.toISOString();
      const rect = dragState.bar.getBoundingClientRect();
      showDragBubble(`${formatDate(newStart)} → ${formatDate(newEnd)}<span class="muted">édition</span>`, e.clientX, rect.top + rect.height / 2);
    } else if (dragState.milestone) {
      const newDate = addDays(dragState.originalMilestoneDate, deltaDays);
      const x = ((diffInDays(visibleStart, newDate) + 0.5) / totalDays) * containerWidth;
      dragState.milestone.style.left = x.toFixed(1) + "px";
      const rect = dragState.milestone.getBoundingClientRect();
      showDragBubble(`${formatDate(newDate)}<span class="muted">jalon</span>`, e.clientX, rect.top + rect.height / 2);
    }
  }

  async function onDragEnd(e) {
    if (!dragState.active) return;
    e.preventDefault();
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    hideDragBubble();

    try {
      const node = nodeById.get(dragState.nodeId);
      if (!node) return;
      if (dragState.type === "move-milestone") {
        const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.pxPerDay);
        const newDate = addDays(dragState.originalMilestoneDate, deltaDays);
        await updateNodeDates(node, null, newDate);
      } else {
        await updateNodeDates(node, normalizeDate(dragState.bar.dataset.start), normalizeDate(dragState.bar.dataset.end));
      }
      showToast("Dates mises à jour dans la table source", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message || "Erreur lors de la mise à jour", "error");
    } finally {
      dragState.active = false;
      dragState.type = null;
      dragState.bar = null;
      dragState.milestone = null;
      dragState.nodeId = null;
    }
  }

  function buildFallbackPayload(node, newStart, newEnd) {
    if (!latestMappings || !node.firstDisplayRowId) return null;
    const aliasValues = { id: node.firstDisplayRowId };
    if (newStart && node.fallbackAliases.start) aliasValues[node.fallbackAliases.start] = toGristDateString(newStart);
    if (newEnd && node.fallbackAliases.end) aliasValues[node.fallbackAliases.end] = toGristDateString(newEnd);
    const mapped = grist.mapColumnNamesBack(aliasValues, { mappings: latestMappings });
    if (!mapped || typeof mapped !== "object") return null;
    const id = mapped.id;
    const fields = cleanRecordForUpdate(mapped);
    if (id == null || !Object.keys(fields).length) return null;
    return { id, fields };
  }

  async function updateNodeDates(node, newStart, newEnd) {
    const fields = {};
    if (newStart && node.source.startCol) fields[node.source.startCol] = toGristDateString(newStart);
    if (newEnd && node.source.endCol) fields[node.source.endCol] = toGristDateString(newEnd);

    if (node.source.tableId && node.source.rowId != null && Object.keys(fields).length) {
      await grist.docApi.applyUserActions([["UpdateRecord", node.source.tableId, node.source.rowId, fields]]);
      setDebugSyncMode("docApi.applyUserActions (vraie table source)");
      setDebugAction(`Update ${node.source.tableId}#${node.source.rowId}: ${Object.keys(fields).join(", ")}`);
      return;
    }

    const fallback = buildFallbackPayload(node, newStart, newEnd);
    if (fallback) {
      try {
        await grist.selectedTable.update([fallback]);
        setDebugSyncMode("selectedTable.update (fallback mapping)");
        setDebugAction(`Update ligne consolidée ${fallback.id}`);
      } catch (err) {
        if (!currentTableId) throw err;
        await grist.docApi.applyUserActions([["UpdateRecord", currentTableId, fallback.id, fallback.fields]]);
        setDebugSyncMode("docApi.applyUserActions (fallback table sélectionnée)");
        setDebugAction(`Update ${currentTableId}#${fallback.id}`);
      }
      return;
    }

    throw new Error("Aucune cible d’écriture. Mappez table source, id source et colonnes début/fin du niveau.");
  }

  function refreshTableInfo() {
    const mappedCols = latestMappings && latestMappings.columns ? Object.keys(latestMappings.columns).length : latestMappings ? Object.keys(latestMappings).length : 0;
    const routed = allRecords.filter((n) => n.source.tableId && n.source.rowId != null).length;
    if (mappingInfoEl) mappingInfoEl.textContent = `Mapping actif : ${currentMappingsOk ? "oui" : "non"}, table liée = ${currentTableId || "inconnue"}, mappings reçus = ${mappedCols}, niveaux = 1/2/3, écritures routées = ${routed}/${allRecords.length}`;
    setDebugSyncMode(latestWriteSummary);
  }

  function hasCollapsibleNodes() {
    return allRecords.some((n) => n.children.length);
  }

  function areAllCollapsibleNodesExpanded() {
    const nodesWithChildren = allRecords.filter((n) => n.children.length);
    return nodesWithChildren.length > 0 && nodesWithChildren.every((n) => expandedNodes[n.id] !== false);
  }

  function updateExpandAllButton() {
    if (!expandAllBtn) return;
    expandAllBtn.textContent = areAllCollapsibleNodesExpanded() ? "Tout plier" : "Tout déplier";
    expandAllBtn.disabled = !hasCollapsibleNodes();
  }

  function render() {
    if (!allRecords.length) {
      taskListEl.innerHTML = '<div class="empty">En attente de données ou du mapping niveau 1…</div>';
      timelineGridEl.innerHTML = "";
      yearsRowEl.innerHTML = monthsRowEl.innerHTML = weeksRowEl.innerHTML = daysRowEl.innerHTML = "";
      currentPeriodEl.textContent = "–";
      taskCountEl.textContent = "";
      updateExpandAllButton();
      return;
    }
    initColorFieldSelect();
    buildHeaders();
    renderTaskList();
    renderTimeline();
    refreshTableInfo();
    updateExpandAllButton();
  }

  document.querySelectorAll(".zoom-controls .btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      zoomMode = btn.dataset.zoom;
      updateZoomButtons();
      setVisibleRangeForZoom();
      saveState();
      render();
    });
  });

  prevBtn.addEventListener("click", () => shiftVisibleRange("left"));
  nextBtn.addEventListener("click", () => shiftVisibleRange("right"));
  todayBtn.addEventListener("click", () => { setVisibleRangeForZoom(); saveState(); render(); });
  toggleSidebarBtn.addEventListener("click", () => {
    const collapsed = ganttContainer.classList.toggle("sidebar-collapsed");
    toggleSidebarBtn.textContent = collapsed ? "Afficher liste" : "Masquer liste";
  });
  toggleLabelsBtn.addEventListener("click", () => {
    labelsVisible = !labelsVisible;
    toggleLabelsBtn.textContent = labelsVisible ? "Masquer labels" : "Afficher labels";
    saveState();
    render();
  });
  groupChildrenBtn.addEventListener("click", () => {
    compactChildren = !compactChildren;
    groupChildrenBtn.textContent = compactChildren ? "Niveaux bas : 1 ligne" : "Niveaux bas : multi-lignes";
    saveState();
    render();
  });
  toggleDateEditBtn.addEventListener("click", () => {
    allowTimelineDateEdit = !allowTimelineDateEdit;
    toggleDateEditBtn.textContent = allowTimelineDateEdit ? "Dates: édition autorisée" : "Dates: édition bloquée";
    toggleDateEditBtn.classList.toggle("active", allowTimelineDateEdit);
    saveState();
  });
  expandAllBtn.addEventListener("click", () => {
    const shouldExpand = !areAllCollapsibleNodesExpanded();
    allRecords.forEach((n) => { if (n.children.length) expandedNodes[n.id] = shouldExpand; });
    saveState();
    render();
  });
  colorFieldSelect.addEventListener("change", (e) => { colorField = e.target.value; saveState(); render(); });
  window.addEventListener("resize", () => {
    if (!allRecords.length) return;
    if (zoomMode === "day") keepOrRecomputeVisibleRange();
    render();
  });

  if (toggleMappingPanelBtn && mappingPanelEl && debugPanelEl) {
    toggleMappingPanelBtn.textContent = "Aide mapping";
    mappingPanelEl.innerHTML = `
      <div><strong>Mapping multi-niveau</strong> : mappez au minimum <code>level1Name</code>. Les niveaux 2 et 3 sont optionnels et peuvent aussi être des colonnes <em>Reference List</em>.</div>
      <div>Si <code>level2Name</code> ou <code>level3Name</code> contient plusieurs références, le widget crée une branche pour chaque référence au lieu de ne prendre que la première.</div>
      <div>Pour écrire dans les vraies tables sources, exposez pour chaque niveau : <code>levelNSourceTableId</code>, <code>levelNSourceRowId</code>, <code>levelNStartColId</code>, <code>levelNEndColId</code> (et éventuellement <code>levelNProgressColId</code>).</div>
      <div>Exemple : Projets → Tâches → Sous-tâches avec <code>level1SourceTableId=Projets</code>, <code>level2SourceTableId=Taches</code>, <code>level3SourceTableId=Sous_taches</code>.</div>
    `;
    toggleMappingPanelBtn.addEventListener("click", () => {
      const shouldShow = mappingPanelEl.hasAttribute("hidden");
      for (const panel of [debugPanelEl, mappingPanelEl]) {
        if (shouldShow) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "hidden");
      }
      toggleMappingPanelBtn.classList.toggle("active", shouldShow);
      toggleMappingPanelBtn.textContent = shouldShow ? "Masquer aide" : "Aide mapping";
    });
  } else if (toggleMappingPanelBtn) {
    toggleMappingPanelBtn.addEventListener("click", () => {
      if (!debugPanelEl) return;
      const shouldShow = debugPanelEl.hasAttribute("hidden");
      if (shouldShow) debugPanelEl.removeAttribute("hidden");
      else debugPanelEl.setAttribute("hidden", "hidden");
      toggleMappingPanelBtn.classList.toggle("active", shouldShow);
      toggleMappingPanelBtn.textContent = shouldShow ? "Masquer aide" : "Aide mapping";
    });
  }

  toggleDateEditBtn.textContent = allowTimelineDateEdit ? "Dates: édition autorisée" : "Dates: édition bloquée";
  toggleDateEditBtn.classList.toggle("active", allowTimelineDateEdit);
  toggleLabelsBtn.textContent = labelsVisible ? "Masquer labels" : "Afficher labels";
  groupChildrenBtn.textContent = compactChildren ? "Niveaux bas : 1 ligne" : "Niveaux bas : multi-lignes";
  updateExpandAllButton();
  updateZoomButtons();

  grist.ready({
    requiredAccess: "full",
    columns: [
      { name: "level1Name", title: "Niveau 1 — nom", optional: false },
      { name: "level1Start", title: "Niveau 1 — date début", optional: true, type: "Date,DateTime" },
      { name: "level1End", title: "Niveau 1 — date fin", optional: true, type: "Date,DateTime" },
      { name: "level1Status", title: "Niveau 1 — statut", optional: true },
      { name: "level1Responsible", title: "Niveau 1 — responsable", optional: true },
      { name: "level1Progress", title: "Niveau 1 — avancement", optional: true },
      { name: "level1SourceTableId", title: "Niveau 1 — table source", optional: true },
      { name: "level1SourceRowId", title: "Niveau 1 — id source", optional: true },
      { name: "level1StartColId", title: "Niveau 1 — colonne début source", optional: true },
      { name: "level1EndColId", title: "Niveau 1 — colonne fin source", optional: true },
      { name: "level1ProgressColId", title: "Niveau 1 — colonne avancement source", optional: true },

      { name: "level2Name", title: "Niveau 2 — nom", optional: true },
      { name: "level2Start", title: "Niveau 2 — date début", optional: true, type: "Date,DateTime" },
      { name: "level2End", title: "Niveau 2 — date fin", optional: true, type: "Date,DateTime" },
      { name: "level2Status", title: "Niveau 2 — statut", optional: true },
      { name: "level2Responsible", title: "Niveau 2 — responsable", optional: true },
      { name: "level2Progress", title: "Niveau 2 — avancement", optional: true },
      { name: "level2SourceTableId", title: "Niveau 2 — table source", optional: true },
      { name: "level2SourceRowId", title: "Niveau 2 — id source", optional: true },
      { name: "level2StartColId", title: "Niveau 2 — colonne début source", optional: true },
      { name: "level2EndColId", title: "Niveau 2 — colonne fin source", optional: true },
      { name: "level2ProgressColId", title: "Niveau 2 — colonne avancement source", optional: true },

      { name: "level3Name", title: "Niveau 3 — nom", optional: true },
      { name: "level3Start", title: "Niveau 3 — date début", optional: true, type: "Date,DateTime" },
      { name: "level3End", title: "Niveau 3 — date fin", optional: true, type: "Date,DateTime" },
      { name: "level3Status", title: "Niveau 3 — statut", optional: true },
      { name: "level3Responsible", title: "Niveau 3 — responsable", optional: true },
      { name: "level3Progress", title: "Niveau 3 — avancement", optional: true },
      { name: "level3SourceTableId", title: "Niveau 3 — table source", optional: true },
      { name: "level3SourceRowId", title: "Niveau 3 — id source", optional: true },
      { name: "level3StartColId", title: "Niveau 3 — colonne début source", optional: true },
      { name: "level3EndColId", title: "Niveau 3 — colonne fin source", optional: true },
      { name: "level3ProgressColId", title: "Niveau 3 — colonne avancement source", optional: true },
    ]
  });

  grist.onRecords(async function (records, mappings) {
    setDebugStatus(`onRecords reçu: ${records ? records.length : 0} ligne(s)`);
    latestMappings = mappings || null;
    try {
      currentTableId = await grist.selectedTable.getTableId();
    } catch (e) {
      currentTableId = null;
    }

    if (!records || !records.length) {
      allRecords = [];
      treeRoots = [];
      flatTracks = [];
      nodeById = new Map();
      globalMinDate = null;
      globalMaxDate = null;
      currentMappingsOk = false;
      render();
      refreshTableInfo();
      return;
    }

    try {
      currentMappingsOk = !!grist.mapColumnNames(records[0], { mappings: latestMappings });
      setDebugStatus(currentMappingsOk ? "Mapping OK" : "Mapping KO");
    } catch (e) {
      currentMappingsOk = false;
      setDebugStatus("Mapping KO");
    }

    buildLogicalRecords(records);
    const range = computeGlobalRange(allRecords);
    globalMinDate = range.min;
    globalMaxDate = range.max;
    keepOrRecomputeVisibleRange();
    saveState();
    render();
  });
})();
