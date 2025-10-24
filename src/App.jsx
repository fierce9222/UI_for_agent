import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import axios from "axios";

// Все API-запросы идут через прокси UI → агент
axios.defaults.baseURL = "/api";
axios.defaults.headers.common["Content-Type"] = "application/json";

const TABS = [
  { id: "files", label: "Файлы" },
  { id: "summary", label: "Сводка по проекту" },
  { id: "task", label: "Текущая задача" },
  { id: "plan", label: "План разработки" },
];

const NotificationContext = React.createContext();

const NotificationProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);

  const removeMessage = useCallback((id) => {
    setMessages((msgs) => msgs.filter((msg) => msg.id !== id));
  }, []);

  const pushMessage = useCallback(
    (message) => {
      const id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2);
      const payload = { id, ...message };
      setMessages((msgs) => [...msgs, payload]);
      setTimeout(() => removeMessage(id), message.ttl ?? 4000);
    },
    [removeMessage]
  );

  const contextValue = useMemo(() => ({ pushMessage }), [pushMessage]);

  return (
    <NotificationContext.Provider value={contextValue}>
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

const useCachedRequest = (endpoint, method = "GET") => {
  const cacheRef = useRef({ data: null, timestamp: null });
  const { pushMessage } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const request = useCallback(
    async (options = {}) => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios({ url: endpoint, method, ...options });
        const payload = response.data;
        cacheRef.current = { data: payload, timestamp: Date.now() };
        setData(payload);
        setLoading(false);
        return payload;
      } catch (err) {
        console.error(err);
        const description = err.response?.data?.message || err.message;
        pushMessage({ type: "error", title: "Ошибка", description });
        setError(description);
        setLoading(false);
        throw err;
      }
    },
    [endpoint, method, pushMessage]
  );

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
          activeTab === tab.id
            ? "bg-slate-900 text-white"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
        onClick={() => onChange(tab.id)}
        type="button"
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

const FilesTab = () => {
  const { data, loading, request, hydrateFromCache } = useCachedRequest("/files");
  const { pushMessage } = useNotifications();
  const [filter, setFilter] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [content, setContent] = useState("");
  const [isContentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    if (!data) request();
    else hydrateFromCache();
  }, [data, hydrateFromCache, request]);

  const filteredFiles = useMemo(() => {
    if (!data?.files) return [];
    return data.files.filter((file) => file.name.toLowerCase().includes(filter.toLowerCase()));
  }, [data, filter]);

  const fetchFileContent = async (fileName) => {
    setContentLoading(true);
    try {
      const response = await axios.get(`/files`, { params: { name: fileName } });
      setContent(response.data.content ?? "");
      setSelectedFile(fileName);
    } catch (err) {
      // handled globally
    } finally {
      setContentLoading(false);
    }
  };

  const triggerIndexing = async () => {
    try {
      await axios.post("/index");
      pushMessage({ type: "success", title: "Индексация запущена", description: "Индексация файлов успешно запущена." });
    } catch (err) {
      // handled globally
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader
          title="Список файлов"
          actions={
            <>
              <input
                type="search"
                value={filter}
                placeholder="Поиск по имени..."
                onChange={(e) => setFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 text-sm"
              />
              <button
                type="button"
                onClick={triggerIndexing}
                className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
              >
                Индексировать
              </button>
            </>
          }
        />
        <div className="overflow-hidden border border-slate-100 rounded-xl">
          <div className="max-h-96 overflow-auto scrollbar-thin">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Имя</th>
                  <th className="px-4 py-3 text-left">Описание</th>
                  <th className="px-4 py-3 text-left">Изменен</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-center text-slate-400" colSpan="3">
                      Загрузка...
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-center text-slate-400" colSpan="3">
                      Файлы не найдены
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file) => (
                    <tr
                      key={file.name}
                      className={`cursor-pointer transition-colors ${
                        selectedFile === file.name ? "bg-slate-100" : "hover:bg-slate-50"
                      }`}
                      onClick={() => fetchFileContent(file.name)}
                    >
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
        <div className="flex-1 bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto scrollbar-thin text-sm">
          {isContentLoading ? "Загрузка содержимого..." : content || "Выберите файл, чтобы увидеть содержимое."}
        </div>
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

const ProjectSummaryTab = () => {
  const { data, loading, request, hydrateFromCache } = useCachedRequest("/project");

  useEffect(() => {
    if (!data) request();
    else hydrateFromCache();
  }, [data, hydrateFromCache, request]);

  const metadata = data?.project ?? {};
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <SectionHeader
          title="Сводка проекта"
          actions={
            <button
              type="button"
              onClick={() => request()}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Обновить
            </button>
          }
        />
        {loading ? (
          <div className="text-slate-500">Загрузка...</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-600">
            <div className="space-y-2">
              <div>
                <span className="text-slate-500">Название:</span> {metadata.name ?? "—"}
              </div>
              <div>
                <span className="text-slate-500">Количество файлов:</span> {metadata.fileCount ?? "—"}
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <span className="text-slate-500">Размер:</span> {metadata.size ?? "—"}
              </div>
              <div>
                <span className="text-slate-500">Последняя индексация:</span> {metadata.lastIndexed ?? "—"}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="grid md:grid-cols-4 gap-4">
        <StatCard label="Активных задач" value={stats.active ?? "—"} />
        <StatCard label="Завершено" value={stats.completed ?? "—"} />
        <StatCard label="В ожидании" value={stats.pending ?? "—"} />
        <StatCard label="Ошибок" value={stats.failed ?? "—"} />
      </div>
    </div>
  );
};

const StatusPill = ({ status }) => {
  const map = {
    pending: "В ожидании",
    running: "Выполняется",
    done: "Готово",
    failed: "Ошибка",
  };
  const color = (
    {
      pending: "bg-amber-100 text-amber-700",
      running: "bg-sky-100 text-sky-700",
      done: "bg-emerald-100 text-emerald-700",
      failed: "bg-rose-100 text-rose-700",
    }[status] || "bg-slate-200 text-slate-700"
  );
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}>{map[status] ?? status}</span>;
};

const CurrentTaskTab = () => {
  const { data, request, hydrateFromCache } = useCachedRequest("/task");
  const { pushMessage } = useNotifications();
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadTask = useCallback(() => {
    request().catch(() => {});
  }, [request]);

  useEffect(() => {
    if (!data) loadTask();
    else hydrateFromCache();
  }, [data, hydrateFromCache, loadTask]);

  const taskData = data ?? {};

  const submitTask = async () => {
    if (!input.trim()) {
      pushMessage({ type: "error", title: "Некорректное описание", description: "Заполните поле описания задачи." });
      return;
    }
    setSubmitting(true);
    try {
      await axios.post("/task", { description: input.trim() });
      pushMessage({ type: "success", title: "Задача поставлена", description: "Задача успешно отправлена в агент." });
      setInput("");
      loadTask();
    } catch (err) {
      // handled globally
    } finally {
      setSubmitting(false);
    }
  };

  const cancelTask = async () => {
    try {
      await axios.post("/task", { cancel: true });
      pushMessage({ type: "success", title: "Задача отменена", description: "Текущая задача отменена." });
      loadTask();
    } catch (err) {
      // handled globally
    }
  };

  const textareaRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        if (document.activeElement === textareaRef.current) {
          event.preventDefault();
          submitTask();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="Текущая задача" />
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">Описание задачи</label>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Опишите, что нужно сделать..."
            rows="4"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={submitTask}
            disabled={submitting}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors ${
              submitting ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"
            }`}
          >
            Отправить (Ctrl+Enter)
          </button>
          <button
            type="button"
            onClick={cancelTask}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Отменить
          </button>
          <button
            type="button"
            onClick={loadTask}
            className="px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Обновить
          </button>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="Детали задачи" />
        <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-600">
          <div>
            <div className="text-slate-500">Описание</div>
            <div className="font-medium text-slate-800 mt-1">{taskData.description ?? "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">Статус</div>
            <div className="mt-1">
              <StatusPill status={taskData.status} />
            </div>
          </div>
          <div>
            <div className="text-slate-500">Прогресс</div>
            <div className="mt-1 font-medium text-slate-800">{taskData.progress ?? "0%"}%</div>
          </div>
          <div>
            <div className="text-slate-500">Обновлено</div>
            <div className="mt-1 text-slate-700">{taskData.updatedAt ?? "—"}</div>
          </div>
        </div>
        <div>
          <div className="text-slate-500 mb-2">Лог</div>
          <div className="bg-slate-900 text-slate-100 rounded-xl p-4 text-xs whitespace-pre-wrap max-h-72 overflow-auto scrollbar-thin">
            {taskData.log ?? "Лог пуст или недоступен."}
          </div>
        </div>
      </div>
    </div>
  );
};

const PriorityBadge = ({ priority }) => {
  const map = {
    high: { label: "Высокий", className: "bg-rose-100 text-rose-700" },
    medium: { label: "Средний", className: "bg-amber-100 text-amber-700" },
    low: { label: "Низкий", className: "bg-emerald-100 text-emerald-700" },
  };
  const { label, className } = map[priority] ?? { label: "Неизвестно", className: "bg-slate-200 text-slate-700" };
  return <span className={`px-3 py-1 rounded-full text-xs font-medium ${className}`}>{label}</span>;
};

const DevelopmentPlanTab = () => {
  const { data, request, hydrateFromCache } = useCachedRequest("/plan");
  const { pushMessage } = useNotifications();
  const [statusFilter, setStatusFilter] = useState("all");
  const [draft, setDraft] = useState({ title: "", priority: "medium", status: "planned" });
  const [isSaving, setIsSaving] = useState(false);

  const loadPlan = useCallback(() => {
    request().catch(() => {});
  }, [request]);

  useEffect(() => {
    if (!data) loadPlan();
    else hydrateFromCache();
  }, [data, hydrateFromCache, loadPlan]);

  const filteredItems = useMemo(() => {
    if (!data?.plan) return [];
    if (statusFilter === "all") return data.plan;
    return data.plan.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const savePlanItem = async () => {
    if (!draft.title.trim()) {
      pushMessage({ type: "error", title: "Пустое название", description: "Введите название элемента." });
      return;
    }
    setIsSaving(true);
    try {
      await axios.post("/plan", draft);
      pushMessage({ type: "success", title: "Элемент сохранен", description: "План обновлен успешно." });
      setDraft({ title: "", priority: "medium", status: "planned" });
      loadPlan();
    } catch (err) {
      // handled globally
    } finally {
      setIsSaving(false);
    }
  };

  const editItem = (item) => {
    setDraft({ id: item.id, title: item.title, priority: item.priority, status: item.status });
    pushMessage({ type: "success", title: "Редактирование", description: "Форма заполнена данными элемента." });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader title="План разработки" />
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Название</label>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Название элемента"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Приоритет</label>
            <select
              value={draft.priority}
              onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-slate-600 font-medium">Статус</label>
            <select
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="planned">planned</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={savePlanItem}
              disabled={isSaving}
              className={`px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors ${
                isSaving ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 hover:bg-slate-800"
              }`}
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <SectionHeader
          title="Элементы плана"
          actions={
            <div className="flex gap-2">
              {[
                { value: "all", label: "Все" },
                { value: "planned", label: "Запланировано" },
                { value: "in_progress", label: "В работе" },
                { value: "done", label: "Сделано" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatusFilter(option.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                    statusFilter === option.value
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="text-slate-500 text-sm">Нет элементов.</div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className="border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="text-base font-semibold text-slate-800">{item.title}</div>
                  <div className="text-xs text-slate-500 mt-1">ID: {item.id}</div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <PriorityBadge priority={item.priority} />
                  <StatusPill status={item.status} />
                  <button
                    type="button"
                    onClick={() => editItem(item)}
                    className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    Редактировать
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const TabContent = ({ activeTab }) => {
  switch (activeTab) {
    case "files":
      return <FilesTab />;
    case "summary":
      return <ProjectSummaryTab />;
    case "task":
      return <CurrentTaskTab />;
    case "plan":
      return <DevelopmentPlanTab />;
    default:
      return null;
  }
};

const App = () => {
  const [activeTab, setActiveTab] = useState("files");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsPersist, setSettingsPersist] = useState(true);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const { data } = await axios.get("/settings");
      setSettings(data);
    } catch (e) {
      console.error("Failed to load settings");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => { if (showSettings) loadSettings(); }, [showSettings, loadSettings]);

  const saveSettings = useCallback(async () => {
    if (!settings) return;
    setSettingsSaving(true);
    try {
      const payload = {
        ...settings,
        temperature: Number(settings.temperature),
        max_tokens: Number(settings.max_tokens),
        max_ctx: Number(settings.max_ctx),
        max_steps: Number(settings.max_steps),
        cache_ttl: Number(settings.cache_ttl),
        cache_max_size: Number(settings.cache_max_size),
        persist: settingsPersist,
      };
      await axios.post("/settings", payload);
      console.log("Settings saved", { persisted: settingsPersist });
      setShowSettings(false);
    } catch (e) {
      console.error("Settings save failed", e.response?.data?.detail || e.message);
      } finally {
        setSettingsSaving(false);
      }
  }, [settings, settingsPersist]);

  return (
    <NotificationProvider>
      <div className="max-w-6xl mx-auto py-10 px-4 lg:px-0 space-y-8">
        <header className="space-y-4">
          <h1 className="text-3xl font-semibold text-slate-900">UI для управления агентом</h1>
          <p className="text-slate-600 text-sm md:text-base max-w-2xl">
            Панель для обзора файлов, сводки проекта, управления задачей и планом разработки. Работает через API Python-агента.
          </p>
        </header>
        <TabNavigation activeTab={activeTab} onChange={setActiveTab} />
        <main>
          <TabContent activeTab={activeTab} />
        </main>
      </div>
      {/* Floating Settings button */}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        className="fixed bottom-4 right-4 px-4 py-2 rounded-xl text-sm font-medium bg-slate-900 text-white shadow hover:bg-slate-800"
        aria-label="Open settings"
      >
        Settings
      </button>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSettings(false)} />
          <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200 p-6 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Settings</h3>
              <button type="button" onClick={() => setShowSettings(false)} className="px-3 py-1 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
            </div>
            {settingsLoading ? (
              <div className="text-slate-500">Loading...</div>
            ) : (
              <div className="space-y-4">
                {[
                  { key: 'model', type: 'text', placeholder: 'gpt-oss:20b-cloud' },
                  { key: 'fallback_model', type: 'text', placeholder: 'phi3:3.8b' },
                  { key: 'temperature', type: 'number' },
                  { key: 'max_tokens', type: 'number' },
                  { key: 'max_ctx', type: 'number' },
                  { key: 'max_steps', type: 'number' },
                  { key: 'ollama_base_url', type: 'text', placeholder: 'http://localhost:11434' },
                  { key: 'cache_ttl', type: 'number' },
                  { key: 'cache_max_size', type: 'number' },
                ].map((f) => (
                  <div key={f.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <div className="text-sm text-slate-600">{f.key}</div>
                    <div className="md:col-span-2">
                      <input
                        type={f.type}
                        placeholder={f.placeholder || ''}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                        value={settings?.[f.key] ?? ''}
                        onChange={(e)=>setSettings(s=>({...s, [f.key]: e.target.value}))}
                      />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div className="text-sm text-slate-600">safe_mode</div>
                  <div className="md:col-span-2">
                    <button type="button" onClick={()=>setSettings(s=>({...s, safe_mode: !s.safe_mode}))} className={`px-3 py-1 rounded-full text-xs font-medium border ${settings?.safe_mode?'bg-emerald-100 text-emerald-700 border-emerald-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>{settings?.safe_mode?'on':'off'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div className="text-sm text-slate-600">shell_enabled</div>
                  <div className="md:col-span-2">
                    <button type="button" onClick={()=>setSettings(s=>({...s, shell_enabled: !s.shell_enabled}))} className={`px-3 py-1 rounded-full text-xs font-medium border ${settings?.shell_enabled?'bg-emerald-100 text-emerald-700 border-emerald-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>{settings?.shell_enabled?'on':'off'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div className="text-sm text-slate-600">cache_enabled</div>
                  <div className="md:col-span-2">
                    <button type="button" onClick={()=>setSettings(s=>({...s, cache_enabled: !s.cache_enabled}))} className={`px-3 py-1 rounded-full text-xs font-medium border ${settings?.cache_enabled?'bg-emerald-100 text-emerald-700 border-emerald-200':'bg-slate-100 text-slate-600 border-slate-200'}`}>{settings?.cache_enabled?'on':'off'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                  <div className="text-sm text-slate-600">project_path</div>
                  <div className="md:col-span-2">
                    <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={settings?.project_path || ''} readOnly />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="rounded" checked={settingsPersist} onChange={(e)=>setSettingsPersist(e.target.checked)} />
                    Persist to .env
                  </label>
                  <div className="flex gap-2">
                    <button type="button" onClick={()=>setShowSettings(false)} className="px-4 py-2 rounded-xl text-sm bg-slate-100 text-slate-700 hover:bg-slate-200">Close</button>
                    <button type="button" onClick={saveSettings} disabled={settingsSaving} className={`px-4 py-2 rounded-xl text-sm font-medium text-white ${settingsSaving?'bg-slate-400 cursor-not-allowed':'bg-slate-900 hover:bg-slate-800'}`}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </NotificationProvider>
  );
};

export default App;
