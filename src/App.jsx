import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import 'highlight.js/styles/github.css';

// API defaults
axios.defaults.baseURL = "/api";
axios.defaults.headers.common["Content-Type"] = "application/json";

const TABS = [
  { id: "files", label: "Файлы" },
  { id: "summary", label: "Сводка" },
  { id: "task", label: "Задача" },
  { id: "plan", label: "План" },
];

// ---------------- Notifications ----------------
const NotificationContext = React.createContext();

const NotificationProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);

  const removeMessage = useCallback((id) => {
    setMessages((msgs) => msgs.filter((m) => m.id !== id));
  }, []);

  const pushMessage = useCallback((message) => {
    const id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
      ? globalThis.crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const payload = { id, ...message };
    setMessages((msgs) => [...msgs, payload]);
    setTimeout(() => removeMessage(id), message.ttl ?? 4000);
  }, [removeMessage]);

  const ctx = useMemo(() => ({ pushMessage }), [pushMessage]);

  return (
    <NotificationContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`shadow-lg rounded-xl px-4 py-3 text-sm border ${
              msg.type === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : "bg-emerald-50 border-emerald-200 text-emerald-700"
            }`}
          >
            <div className="font-semibold mb-1">{msg.title}</div>
            <div>{msg.description}</div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

const useNotifications = () => React.useContext(NotificationContext);

// ---------------- Utils ----------------
const useCachedRequest = (endpoint, method = "GET") => {
  const cacheRef = useRef({ data: null, ts: 0 });
  const { pushMessage } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const request = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios({ url: endpoint, method, ...options });
      cacheRef.current = { data: response.data, ts: Date.now() };
      setData(response.data);
      setLoading(false);
      return response.data;
    } catch (e) {
      const description = e.response?.data?.message || e.message || "Request failed";
      pushMessage({ type: "error", title: "Ошибка", description });
      setError(description);
      setLoading(false);
      throw e;
    }
  }, [endpoint, method, pushMessage]);

  const hydrateFromCache = useCallback(() => {
    if (cacheRef.current.data) setData(cacheRef.current.data);
  }, []);

  return { data, loading, error, request, hydrateFromCache };
};

const SectionHeader = ({ title, actions }) => (
  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
    <h2 className="text-xl font-semibold text-slate-800">{title}</h2>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

const TabNavigation = ({ activeTab, onChange }) => (
  <nav className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap gap-2">
    {TABS.map((tab) => (
      <button
        key={tab.id}
        className={`px-4 py-2 rounded-xl transition-colors text-sm font-medium ${
          activeTab === tab.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
        onClick={() => onChange(tab.id)}
        type="button"
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

// ---------------- Files ----------------
const FilesTab = () => {
  const { data, loading, request, hydrateFromCache } = useCachedRequest("/files");
  const { pushMessage } = useNotifications();
  const [filter, setFilter] = useState("");
  const [content, setContent] = useState("");
  const [isContentLoading, setContentLoading] = useState(false);
  const [treeData, setTreeData] = useState(null);
  const [selectedFile, setSelectedFile] = useState("");

  useEffect(() => {
    if (!data) request(); else hydrateFromCache();
  }, [data, hydrateFromCache, request]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const resp = await axios.get('/tree');
        if (!canceled) setTreeData(resp.data?.root || null);
      } catch (_) { /* fallback to list */ }
    })();
    return () => { canceled = true; };
  }, []);

  const filteredFiles = useMemo(() => {
    if (!data?.files) return [];
    return data.files.filter((f) => f.name.toLowerCase().includes(filter.toLowerCase()));
  }, [data, filter]);

  const fetchFileContent = async (fileName) => {
    setContentLoading(true);
    try {
      const res = await axios.get('/files', { params: { name: fileName } });
      setContent(res.data?.content ?? "");
      setSelectedFile(fileName || "");
    } finally { setContentLoading(false); }
  };

  const indexNow = async () => {
    try { await axios.post('/index'); pushMessage({ type: 'success', title: 'Индексация', description: 'Запущена в фоне' }); }
    catch (_) {}
  };

  if (treeData) {
    const Node = ({ node }) => {
      const [open, setOpen] = useState(true);
      const isDir = node.type === 'dir';
      return (
        <div className="ml-2">
          <div className="flex items-center gap-2 py-1">
            {isDir ? (
              <button type="button" onClick={() => setOpen(!open)} className="text-slate-700 text-sm hover:underline">
                {open ? '▾' : '▸'} 📁 {node.name}
              </button>
            ) : (
              <button type="button" onClick={() => fetchFileContent(node.path)} className="text-slate-700 text-sm hover:underline">
                📄 {node.name}
              </button>
            )}
            {!isDir && node.description && (
              <span className="text-slate-400 text-xs">— {node.description}</span>
            )}
          </div>
          {isDir && open && node.children && (
            <div className="ml-3 pl-2 border-l border-slate-200">
              {node.children.map((child, i) => <Node key={i} node={child} />)}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <SectionHeader title="Файлы проекта (дерево)" actions={
            <button type="button" onClick={indexNow} className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium">Индексировать</button>
          } />
          <div className="max-h-96 overflow-auto scrollbar-thin">
            <Node node={treeData} />
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <SectionHeader title="Содержимое файла" />
          <div className="flex-1 rounded-xl overflow-auto scrollbar-thin text-sm">
            {isContentLoading ? (
              <div className="text-slate-500">Загрузка содержимого...</div>
            ) : content ? (
              <ReactMarkdown
                className="prose prose-slate max-w-none"
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >{(() => {
                // Если это не markdown, но это код — обернём в fenced code для подсветки
                const ext = (selectedFile.split('.').pop() || '').toLowerCase();
                const langMap = {
                  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
                  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c',
                  java: 'java', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', ps1: 'powershell',
                  json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', html: 'html', css: 'css'
                };
                const lang = langMap[ext] || '';
                // Простая эвристика: если это .md — рендерим как есть, иначе как код
                if (ext === 'md') return content;
                return '```' + (lang || '') + '\n' + content + '\n```';
              })()}
              </ReactMarkdown>
            ) : (
              <div className="text-slate-500">Выберите файл слева.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader title="Список файлов" actions={
          <>
            <input
              type="search"
              value={filter}
              placeholder="Поиск по имени файла..."
              onChange={(e) => setFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
            />
            <button type="button" onClick={indexNow} className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium">Индексировать</button>
          </>
        } />
        <div className="overflow-hidden border border-slate-100 rounded-xl">
          <div className="max-h-96 overflow-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Описание</th>
                  <th className="px-4 py-3 text-left">Изменён</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-4 py-5 text-center text-slate-400" colSpan="3">Загрузка...</td></tr>
                ) : filteredFiles.length === 0 ? (
                  <tr><td className="px-4 py-5 text-center text-slate-400" colSpan="3">Файлы не найдены</td></tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr key={file.name} className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => fetchFileContent(file.name)}>
                      <td className="px-4 py-3 font-medium text-slate-700">{file.name}</td>
                      <td className="px-4 py-3 text-slate-600">{file.description}</td>
                      <td className="px-4 py-3 text-slate-500">{file.modified}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
        <SectionHeader title="Содержимое файла" />
        <div className="flex-1 rounded-xl overflow-auto scrollbar-thin text-sm">
          {isContentLoading ? (
            <div className="text-slate-500">Загрузка содержимого...</div>
          ) : content ? (
            <ReactMarkdown
              className="prose prose-slate max-w-none"
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >{(() => {
              const ext = (selectedFile.split('.').pop() || '').toLowerCase();
              const langMap = {
                js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
                py: 'python', rb: 'ruby', rs: 'rust', go: 'go', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', c: 'c', h: 'c',
                java: 'java', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', ps1: 'powershell',
                json: 'json', yml: 'yaml', yaml: 'yaml', md: 'markdown', html: 'html', css: 'css'
              };
              const lang = langMap[ext] || '';
              if (ext === 'md') return content;
              return '```' + (lang || '') + '\n' + content + '\n```';
            })()}
            </ReactMarkdown>
          ) : (
            <div className="text-slate-500">Выберите файл слева.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------- Project summary ----------------
const ProjectSummaryTab = () => {
  const { data, loading, request, hydrateFromCache } = useCachedRequest("/project");
  useEffect(() => { if (!data) request(); else hydrateFromCache(); }, [data, hydrateFromCache, request]);
  const metadata = data?.project ?? {};
  const stats = data?.stats ?? {};
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader title="Сводка по проекту" actions={
          <button type="button" onClick={() => request()} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">Обновить</button>
        } />
        {loading ? (
          <div className="text-slate-500">Загрузка...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-600">
            <div className="space-y-2">
              <div><span className="text-slate-500">Название:</span> {metadata.name ?? "-"}</div>
              <div><span className="text-slate-500">Файлов в индексе:</span> {metadata.fileCount ?? "-"}</div>
            </div>
            <div className="space-y-2">
              <div><span className="text-slate-500">Размер:</span> {metadata.size ?? "-"}</div>
              <div><span className="text-slate-500">Последняя индексация:</span> {metadata.lastIndexed ?? "-"}</div>
            </div>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard label="Активных" value={stats.active ?? "-"} />
        <StatCard label="Завершено" value={stats.completed ?? "-"} />
        <StatCard label="Ожидает" value={stats.pending ?? "-"} />
        <StatCard label="Ошибок" value={stats.failed ?? "-"} />
      </div>
    </div>
  );
};

const StatCard = ({ label, value }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <div className="text-xs uppercase text-slate-500 tracking-wide mb-2">{label}</div>
    <div className="text-2xl font-semibold text-slate-800">{value}</div>
  </div>
);

// ---------------- Current task ----------------
const StatusPill = ({ status }) => {
  const map = {
    pending: "Ожидает",
    running: "Выполняется",
    done: "Готово",
    failed: "Ошибка",
  };
  const color = ({
    pending: "bg-amber-100 text-amber-700",
    running: "bg-sky-100 text-sky-700",
    done: "bg-emerald-100 text-emerald-700",
    failed: "bg-rose-100 text-rose-700",
  }[status]) || "bg-slate-200 text-slate-700";
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>{map[status] ?? status}</span>;
};

const CurrentTaskTab = () => {
  const { data, request, hydrateFromCache } = useCachedRequest("/task");
  const { pushMessage } = useNotifications();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTask = useCallback(() => { request().catch(() => {}); }, [request]);
  useEffect(() => { if (!data) loadTask(); else hydrateFromCache(); }, [data, hydrateFromCache, loadTask]);

  const taskData = data ?? {};

  const submitTask = async () => {
    if (!input.trim()) { pushMessage({ type: "error", title: "Пустой ввод", description: "Опишите задачу перед отправкой" }); return; }
    setSubmitting(true);
    try {
      await axios.post("/task", { description: input.trim() });
      pushMessage({ type: "success", title: "Задача запущена", description: "Агент начал выполнение" });
      setInput("");
      loadTask();
    } finally { setSubmitting(false); }
  };

  const cancelTask = async () => {
    try { await axios.post("/task", { cancel: true }); pushMessage({ type: "success", title: "Отменено" }); loadTask(); }
    catch (_) {}
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="Постановка задачи" />
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Описание задачи</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Например: добавь SSE-стрим логов в интерфейсе..."
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={submitTask} disabled={submitting} className={`px-4 py-2 rounded-xl text-sm font-medium text-white ${submitting ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}>Отправить</button>
          <button type="button" onClick={cancelTask} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200">Отмена</button>
          <button type="button" onClick={loadTask} className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200">Обновить</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="Состояние выполнения" />
        <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-600">
          <div>
            <div className="text-slate-500">Описание</div>
            <div className="font-medium text-slate-800 mt-1">{taskData.description ?? "-"}</div>
          </div>
          <div>
            <div className="text-slate-500">Статус</div>
            <div className="mt-1"><StatusPill status={taskData.status} /></div>
          </div>
          <div>
            <div className="text-slate-500">Прогресс</div>
            <div className="mt-1 font-medium text-slate-800">{taskData.progress ?? 0}%</div>
          </div>
          <div>
            <div className="text-slate-500">Обновлено</div>
            <div className="mt-1 text-slate-700">{taskData.updatedAt ?? "-"}</div>
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-2">Логи</div>
          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs whitespace-pre-wrap max-h-72 overflow-auto scrollbar-thin">
            {taskData.log ?? "Логи пока отсутствуют."}
          </div>
        </div>
        {taskData.result && (
          <div className="mt-4">
            <div className="text-slate-500 mb-2">Результат</div>
            <div className="bg-white text-slate-800 border border-slate-200 rounded-xl p-4 text-sm">
              <ReactMarkdown
                className="prose prose-slate max-w-none"
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >{taskData.result}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------- Development plan ----------------
const PriorityBadge = ({ priority }) => {
  const map = {
    high: { label: "высокий", className: "bg-rose-100 text-rose-700" },
    medium: { label: "средний", className: "bg-amber-100 text-amber-700" },
    low: { label: "низкий", className: "bg-emerald-100 text-emerald-700" },
  };
  const { label, className } = map[priority] ?? { label: priority, className: "bg-slate-200 text-slate-700" };
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${className}`}>{label}</span>;
};

const DevelopmentPlanTab = () => {
  const { data, request, hydrateFromCache } = useCachedRequest("/plan");
  const { pushMessage } = useNotifications();
  const [statusFilter, setStatusFilter] = useState("all");
  const [draft, setDraft] = useState({ title: "", priority: "medium", status: "planned" });
  const [isSaving, setIsSaving] = useState(false);

  const loadPlan = useCallback(() => { request().catch(() => {}); }, [request]);
  useEffect(() => { if (!data) loadPlan(); else hydrateFromCache(); }, [data, hydrateFromCache, loadPlan]);

  const filtered = useMemo(() => {
    if (!data?.plan) return [];
    return statusFilter === "all" ? data.plan : data.plan.filter((i) => i.status === statusFilter);
  }, [data, statusFilter]);

  const savePlanItem = async () => {
    if (!draft.title.trim()) { pushMessage({ type: "error", title: "Нет заголовка", description: "Введите заголовок пункта" }); return; }
    setIsSaving(true);
    try { await axios.post('/plan', draft); setDraft({ title: "", priority: "medium", status: "planned" }); loadPlan(); pushMessage({ type: 'success', title: 'Сохранено' }); }
    finally { setIsSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="План разработки" />
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Заголовок</label>
            <input type="text" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Название пункта" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400" />
          </div>
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Приоритет</label>
            <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Статус</label>
            <select value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400">
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={savePlanItem} disabled={isSaving} className={`px-4 py-2 rounded-xl text-sm font-medium text-white ${isSaving ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}>Сохранить</button>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="Список задач" actions={
          <div className="flex gap-2">
            {[
              { value: "all", label: "Все" },
              { value: "planned", label: "Запланировано" },
              { value: "in_progress", label: "В работе" },
              { value: "done", label: "Готово" },
            ].map((opt) => (
              <button key={opt.value} type="button" onClick={() => setStatusFilter(opt.value)} className={`px-3 py-2 rounded-xl text-xs font-medium border ${statusFilter === opt.value ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-100"}`}>{opt.label}</button>
            ))}
          </div>
        } />
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-slate-500 text-sm">Пункты отсутствуют.</div>
          ) : (
            filtered.map((item) => (
              <div key={item.id || item.title} className="border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-slate-300">
                <div>
                  <div className="text-base font-semibold text-slate-800">{item.title}</div>
                  {item.id && <div className="text-xs text-slate-500 mt-1">ID: {item.id}</div>}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <PriorityBadge priority={item.priority} />
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{item.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------- Tabs router ----------------
const TabContent = ({ activeTab }) => {
  switch (activeTab) {
    case "files": return <FilesTab />;
    case "summary": return <ProjectSummaryTab />;
    case "task": return <CurrentTaskTab />;
    case "plan": return <DevelopmentPlanTab />;
    default: return null;
  }
};

// ---------------- App ----------------
const App = () => {
  const [activeTab, setActiveTab] = useState("files");
  return (
    <NotificationProvider>
      <div className="max-w-6xl mx-auto py-10 px-4 lg:px-0 space-y-8">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900">UI для агента</h1>
          <p className="text-slate-600 text-sm md:text-base max-w-2xl">
            Просмотр файлов проекта, запуск задач агента, сводка и план — в одном интерфейсе.
          </p>
        </header>
        <TabNavigation activeTab={activeTab} onChange={setActiveTab} />
        <main>
          <TabContent activeTab={activeTab} />
        </main>
      </div>
    </NotificationProvider>
  );
};

export default App;
