import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { User } from "firebase/auth";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import { Button, Modal } from "react-bootstrap";
import { useCampaign } from "../Organization/useCampaign";
import {
  authenticatedFetch,
  authenticatedRequest,
  apiBaseUrl,
} from "../../../lib/api";
import PageContainer from "../../../components/Shared/PageContainer";
import ContentPanel from "../../../components/Shared/ContentPanel";
import EmptyState from "../../../components/Shared/EmptyState";
import Inline from "../../../components/Shared/Inline";
import Stack from "../../../components/Shared/Stack";
import SelectControl from "../../../components/Shared/SelectControl";
import DropdownPortal from "../../../components/Shared/DropdownPortal";
import { Toast } from "../../../components/Toast";
import { Icon } from "../../../components/Shared/Icons";

type CalendarParticipant = {
  uid: string;
  required: boolean;
  status: "pending" | "confirmed" | "declined";
};
type CalendarAttachment = {
  id: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
};
type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  timezone?: string;
  participants: CalendarParticipant[];
  resourceIds: string[];
  teamIds: string[];
  location?: { label?: string; address?: string; mode?: string };
  preparationMinutes?: number;
  teardownMinutes?: number;
  runOfShow?: Array<{ id: string; at: string; title: string; status: string }>;
  revision: number;
  priority?: string;
  labels?: string[];
  isPublication?: boolean;
  linkedUserIds?: string[];
  allowLinkedEditing?: boolean;
  attachments?: CalendarAttachment[];
  canEdit?: boolean;
};
type Member = {
  uid: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  teamId?: string;
};
type Team = { id: string; name: string };
type Resource = { id: string; name: string; type: string; quantity: number };
type Template = {
  id: string;
  name: string;
  event: {
    title?: string;
    description?: string;
    type?: string;
    durationMinutes?: number;
    teamIds?: string[];
    resourceIds?: string[];
    preparationMinutes?: number;
    teardownMinutes?: number;
  };
};
type FormState = {
  title: string;
  type: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  description: string;
  location: string;
  participantIds: string[];
  optionalParticipantIds: string[];
  teamIds: string[];
  resourceIds: string[];
  priority: string;
  preparationMinutes: string;
  teardownMinutes: string;
  isPublication: boolean;
  linkedUserIds: string[];
  allowLinkedEditing: boolean;
};

const typeLabels: Record<string, string> = {
  "campaign-launch": "Lanzamiento de campaña",
  "political-rally": "Actos políticos y mítines",
  "territorial-walk": "Caminatas y recorridas territoriales (Timbreos)",
  "electoral-debate": "Debates electorales",
  "press-conference": "Conferencias de prensa",
  "media-interview": "Entrevistas en medios de comunicación",
  "fundraising-event": "Eventos de recaudación de fondos",
  "community-leaders": "Reuniones con líderes comunitarios, sindicales o empresariales",
  "institution-visit": "Visitas a instituciones, fábricas u ONGs",
  "strategy-meeting": "Reuniones de estrategia con el equipo o comité de campaña",
  "volunteer-training": "Capacitación de voluntarios y fiscales de mesa",
  "spot-recording": "Grabación de spots publicitarios y sesiones de fotos",
  "outreach-table": "Mesas de difusión y entrega de volantes",
  "campaign-closing": "Actos de cierre de campaña",
  "election-day": "Día de la elección (Votación del candidato y vigilia en el búnker)",
  other: "Otros",
  event: "Evento",
  election: "Elección",
  veda: "Veda",
  meeting: "Reunión",
  territory: "Territorio",
  training: "Capacitación",
  communication: "Comunicación",
  legal: "Jurídico",
  fundraising: "Recaudación",
};
const typeColor: Record<string, string> = {
  election: "#ef4444",
  veda: "#f97316",
  meeting: "#7c3aed",
  territory: "#10b981",
  training: "#0ea5e9",
  communication: "#ec4899",
  legal: "#64748b",
  fundraising: "#d97706",
  event: "#0060f0",
};
const typeLabel = (type: string) => typeLabels[type] ?? type;
const typeKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").replace(/\s+/g, " ").trim();
const statusLabel = (status: string) =>
  ({
    draft: "Borrador",
    confirmed: "Confirmado",
    completed: "Completado",
    cancelled: "Cancelado",
  })[status] ?? status;
const priorityLabel = (priority?: string) =>
  ({ low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" })[
    priority ?? "medium"
  ] ?? priority ?? "Media";
const displayMember = (member: Member) =>
  member.displayName ||
  [member.firstName, member.lastName].filter(Boolean).join(" ") ||
  member.email ||
  "Miembro";
const localInput = (value: string) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const initialForm = (date = new Date()): FormState => ({
  title: "",
  type: "campaign-launch",
  startAt: new Date(date.setHours(9, 0, 0, 0)).toISOString().slice(0, 16),
  endAt: new Date(date.setHours(10, 0, 0, 0)).toISOString().slice(0, 16),
  allDay: false,
  description: "",
  location: "",
  participantIds: [],
  optionalParticipantIds: [],
  teamIds: [],
  resourceIds: [],
  priority: "medium",
  preparationMinutes: "0",
  teardownMinutes: "0",
  isPublication: false,
  linkedUserIds: [],
  allowLinkedEditing: true,
});

export default function ElectoralCalendar() {
  const {
    user,
    campaign,
    loading: campaignLoading,
    error: campaignError,
    reload: reloadCampaign,
  } = useCampaign();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [savedTypeOptions, setSavedTypeOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<
    | "dayGridMonth"
    | "timeGridWeek"
    | "timeGridDay"
    | "listWeek"
    | "teams"
    | "run"
  >("dayGridMonth");
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [mine, setMine] = useState(false);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm());
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<
    Array<{ title: string; startAt: string; endAt: string }>
  >([]);
  const [templateModal, setTemplateModal] = useState(false);
  const [availabilityModal, setAvailabilityModal] = useState(false);
  const [operationsModal, setOperationsModal] = useState(false);
  const calendarRef = useRef<FullCalendar>(null);
  const createIdempotencyRef = useRef("");
  const base = campaign
    ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}`
    : "";
  const canEditEvents = Boolean(campaign);
  const canManage = campaign?.role === "cliente" || campaign?.role === "admin";

  const load = useCallback(async () => {
    if (!user || !base) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const [
      eventResult,
      memberResult,
      teamResult,
      resourceResult,
      templateResult,
      typeResult,
    ] = await Promise.all([
      authenticatedRequest<CalendarEvent[]>(user, `${base}/calendar`),
      authenticatedRequest<Member[]>(user, `${base}/members`),
      authenticatedRequest<Team[]>(user, `${base}/teams`),
      authenticatedRequest<Resource[]>(user, `${base}/calendar/resources`),
      authenticatedRequest<Template[]>(user, `${base}/calendar/templates`),
      authenticatedRequest<Array<{ value: string; label: string }>>(
        user,
        `${base}/calendar/types`,
      ),
    ]);
    if (eventResult.error) setError(eventResult.error.message);
    else {
      const receivedEvents = eventResult.data ?? [];
      setEvents(receivedEvents);
      setSelected((current) =>
        current
          ? (receivedEvents.find((event) => event.id === current.id) ?? current)
          : null,
      );
    }
    setMembers(memberResult.data ?? []);
    setTeams(teamResult.data ?? []);
    setResources(resourceResult.data ?? []);
    setTemplates(templateResult.data ?? []);
    setSavedTypeOptions(typeResult.data ?? []);
    setLoading(false);
  }, [base, user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (window.innerWidth < 576) setView("listWeek");
  }, []);

  const filtered = useMemo(
    () =>
      events.filter((event) => {
        const matchText =
          !query ||
          `${event.title} ${event.description ?? ""} ${event.location?.label ?? ""}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase());
        const matchTeam =
          teamFilter === "all" || event.teamIds.includes(teamFilter);
        const matchType = typeFilter === "all" || event.type === typeFilter;
        const matchStatus =
          statusFilter === "all" ||
          (statusFilter === "active"
            ? event.status !== "cancelled"
            : event.status === statusFilter);
        const matchMine =
          !mine ||
          event.participants.some(
            (participant) => participant.uid === user?.uid,
          );
        return matchText && matchTeam && matchType && matchStatus && matchMine;
      }),
    [events, mine, query, statusFilter, teamFilter, typeFilter, user?.uid],
  );
  const typeOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>(
      savedTypeOptions.map((option) => [typeKey(option.label || option.value), option]),
    );
    events
      .map((event) => event.type)
      .filter(Boolean)
      .forEach((value) => {
        const key = typeKey(typeLabel(value));
        if (!options.has(key)) options.set(key, { value, label: typeLabel(value) });
      });
    return [...options.values()];
  }, [events, savedTypeOptions]);
  const fullEvents = useMemo(
    () =>
      filtered.map((event) => ({
        id: event.id,
        title: `${event.isPublication ? "Publicación · " : ""}${event.title}`,
        start: event.startAt,
        end: event.endAt,
        allDay: event.allDay,
        backgroundColor: event.isPublication
          ? "#d6008c"
          : (typeColor[event.type] ?? typeColor.event),
        borderColor: "transparent",
        extendedProps: event,
      })),
    [filtered],
  );
  const nextEvents = useMemo(
    () =>
      events
        .filter(
          (event) =>
            event.status !== "cancelled" &&
            Date.parse(event.endAt) >= Date.now(),
        )
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
        .slice(0, 6),
    [events],
  );

  const move = (direction: "prev" | "next" | "today") => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    api[direction]();
    setTitle(api.view.title);
  };
  const setCalendarView = (next: typeof view) => {
    setView(next);
    const api = calendarRef.current?.getApi();
    if (!api || next === "teams" || next === "run") return;
    api.changeView(next);
    setTitle(api.view.title);
  };
  const showCreate = (date?: Date, template?: Template) => {
    const next = initialForm(date);
    createIdempotencyRef.current =
      typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    if (template) {
      const start = new Date(next.startAt);
      const end = new Date(
        start.getTime() + (template.event.durationMinutes ?? 60) * 60_000,
      );
      next.title = template.event.title ?? "";
      next.description = template.event.description ?? "";
      next.type = template.event.type ?? "campaign-launch";
      next.teamIds = template.event.teamIds ?? [];
      next.resourceIds = template.event.resourceIds ?? [];
      next.preparationMinutes = String(template.event.preparationMinutes ?? 0);
      next.teardownMinutes = String(template.event.teardownMinutes ?? 0);
      next.endAt = end.toISOString().slice(0, 16);
    }
    setSelected(null);
    setConflicts([]);
    setForm(next);
    setModal(true);
    setTemplateModal(false);
  };
  const showEdit = (event: CalendarEvent) => {
    if (!event.canEdit) {
      setNotice("No tenés permiso para editar esta publicación.");
      return;
    }
    setSelected(event);
    setConflicts([]);
    setForm({
      title: event.title,
      type: event.type,
      startAt: localInput(event.startAt),
      endAt: localInput(event.endAt),
      allDay: event.allDay === true,
      description: event.description ?? "",
      location: event.location?.label ?? event.location?.address ?? "",
      participantIds: event.participants.map((participant) => participant.uid),
      optionalParticipantIds: event.participants
        .filter((participant) => !participant.required)
        .map((participant) => participant.uid),
      teamIds: event.teamIds ?? [],
      resourceIds: event.resourceIds ?? [],
      priority: event.priority ?? "medium",
      preparationMinutes: String(event.preparationMinutes ?? 0),
      teardownMinutes: String(event.teardownMinutes ?? 0),
      isPublication: event.isPublication === true,
      linkedUserIds: event.linkedUserIds ?? [],
      allowLinkedEditing: event.allowLinkedEditing === true,
    });
    setModal(true);
  };
  const payload = () => ({
    title: form.title,
    type: form.type,
    startAt: new Date(form.startAt).toISOString(),
    endAt: new Date(form.endAt).toISOString(),
    allDay: form.allDay,
    description: form.description,
    location: {
      label: form.location,
      address: form.location,
      mode: "physical",
    },
    participantIds: form.participantIds,
    optionalParticipantIds: form.optionalParticipantIds,
    teamIds: form.teamIds,
    resourceIds: form.resourceIds,
    priority: form.priority,
    preparationMinutes: Number(form.preparationMinutes),
    teardownMinutes: Number(form.teardownMinutes),
    isPublication: form.isPublication,
    linkedUserIds: form.linkedUserIds,
    allowLinkedEditing: form.allowLinkedEditing,
  });
  const save = async (event: FormEvent, confirmConflicts = false) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const path = selected
        ? `${base}/calendar/${selected.id}`
        : `${base}/calendar`;
      const response = await authenticatedRequest<CalendarEvent>(
        user,
        path,
        {
          method: selected ? "PUT" : "POST",
          body: JSON.stringify({
            ...payload(),
            ...(selected
              ? { expectedRevision: selected.revision }
              : { idempotencyKey: createIdempotencyRef.current }),
            confirmConflicts,
          }),
        },
      );
      if (response.error) {
        if (response.error.status === 409) {
          setConflicts(
            (response.error.details?.conflicts as
              | Array<{ title: string; startAt: string; endAt: string }>
              | undefined) ?? [],
          );
          setNotice(
            "Detectamos conflictos: podés revisar o confirmar el guardado.",
          );
        } else throw response.error;
        return;
      }
      setModal(false);
      setConflicts([]);
      setNotice(selected ? "Evento actualizado." : "Evento creado.");
      if (selected && response.data) {
        setSelected((current) =>
          current?.id === selected.id
            ? { ...current, ...response.data, id: selected.id, canEdit: true }
            : current,
        );
      }
      await load();
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "No se pudo guardar el evento.",
      );
    } finally {
      setSaving(false);
    }
  };
  const destroy = async () => {
    if (
      !selected ||
      !user ||
      !window.confirm(`¿Eliminar definitivamente “${selected.title}”?`)
    )
      return;
    try {
      await authenticatedFetch(user, `${base}/calendar/${selected.id}`, {
        method: "DELETE",
      });
      setSelected(null);
      setNotice("Evento eliminado permanentemente.");
      await load();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "No se pudo eliminar.",
      );
    }
  };
  const cancel = async () => {
    if (!selected || !user) return;
    try {
      await authenticatedFetch(user, `${base}/calendar/${selected.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason: "Cancelado desde el calendario" }),
      });
      setNotice("Evento cancelado.");
      await load();
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "No se pudo cancelar.",
      );
    }
  };
  const eventDrop = async (info: any) => {
    if (!user || !info.event.start) return;
    const original = info.event.extendedProps as CalendarEvent;
    try {
      const response = await authenticatedRequest(
        user,
        `${base}/calendar/${info.event.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            ...original,
            startAt: info.event.start.toISOString(),
            endAt: (
              info.event.end ?? new Date(info.event.start.getTime() + 3_600_000)
            ).toISOString(),
            expectedRevision: original.revision,
          }),
        },
      );
      if (response.error) throw response.error;
      setNotice("Propuesta de horario aplicada y validada.");
      await load();
    } catch (reason) {
      info.revert();
      setNotice(
        reason instanceof Error
          ? reason.message
          : "No se pudo reprogramar por un conflicto.",
      );
    }
  };
  const multiToggle = (
    field:
      | "participantIds"
      | "optionalParticipantIds"
      | "teamIds"
      | "resourceIds"
      | "linkedUserIds",
    value: string,
  ) =>
    setForm((current) => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter((entry) => entry !== value)
        : current[field].concat(value),
    }));
  const createType = async (label: string) => {
    if (!user) throw new Error("Necesitás iniciar sesión para crear un tipo.");
    const response = await authenticatedRequest<{ value: string; label: string }>(
      user,
      `${base}/calendar/types`,
      { method: "POST", body: JSON.stringify({ label }) },
    );
    if (response.error || !response.data) {
      const message = response.error?.message ?? "No se pudo crear el tipo.";
      setNotice(message);
      throw new Error(message);
    }
    setSavedTypeOptions((current) => {
      const next = current.filter((option) => option.value !== response.data!.value);
      return next.concat(response.data!);
    });
    return response.data;
  };
  const duplicate = (event: CalendarEvent) => {
    const start = new Date(event.startAt);
    const end = new Date(event.endAt);
    const next = initialForm(start);
    Object.assign(next, {
      title: `${event.title} (copia)`,
      type: event.type,
      startAt: start.toISOString().slice(0, 16),
      endAt: end.toISOString().slice(0, 16),
      allDay: event.allDay === true,
      description: event.description ?? "",
      location: event.location?.label ?? "",
      participantIds: event.participants.map((participant) => participant.uid),
      optionalParticipantIds: event.participants
        .filter((participant) => !participant.required)
        .map((participant) => participant.uid),
      teamIds: event.teamIds,
      resourceIds: event.resourceIds,
      priority: event.priority ?? "medium",
      preparationMinutes: String(event.preparationMinutes ?? 0),
      teardownMinutes: String(event.teardownMinutes ?? 0),
    });
    setSelected(null);
    setForm(next);
    setModal(true);
  };

  if (campaignLoading || loading)
    return <PageContainer className="electoral-calendar" aria-busy="true" />;
  if (campaignError || error)
    return (
      <PageContainer className="electoral-calendar">
        <ContentPanel
          title="Calendario Electoral"
          subtitle="Agenda de campaña"
          icon="calendar"
        >
          <EmptyState
            icon="calendar"
            title="No pudimos cargar el calendario"
            description={campaignError || error}
            ctaLabel="Reintentar"
            onCtaClick={() => void (campaignError ? reloadCampaign() : load())}
          />
        </ContentPanel>
      </PageContainer>
    );
  return (
    <PageContainer className="electoral-calendar">
      <Stack gap="lg">
        <header className="electoral-calendar__header">
          <Inline gap="md" className="electoral-calendar__heading">
            <span className="electoral-calendar__icon">
              <Icon name="cal" size={27} color="#0060f0" />
            </span>
            <Stack gap="xs">
              <h1>Calendario Electoral</h1>
              <p>
                Coordiná la operación, los equipos y los hitos de tu campaña.
              </p>
            </Stack>
          </Inline>
          <Inline gap="sm" wrap className="electoral-calendar__header-actions">
            <button
              type="button"
              className="btn btn-light"
              data-testid="calendar-find-availability"
              onClick={() => setAvailabilityModal(true)}
            >
              <i className="feather icon-clock" /> Encontrar horario
            </button>
            {canManage && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setTemplateModal(true)}
              >
                <i className="feather icon-copy" /> Desde plantilla
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => setOperationsModal(true)}
              >
                <i className="feather icon-settings" /> Operación
              </button>
            )}
            {canEditEvents && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => showCreate()}
              >
                <i className="feather icon-plus" /> Crear evento
              </button>
            )}
          </Inline>
        </header>
        <section
          className="electoral-calendar__toolbar"
          aria-label="Controles del calendario"
        >
          <Inline gap="sm" wrap>
            <label className="electoral-calendar__search">
              <Icon name="search" size={16} color="#6b86ad" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por título, lugar o equipo"
                aria-label="Buscar eventos"
              />
            </label>
            <button
              type="button"
              className="btn btn-light"
              onClick={() => move("today")}
            >
              Hoy
            </button>
            <Inline gap="xs">
              <button
                type="button"
                className="btn btn-light"
                aria-label="Período anterior"
                onClick={() => move("prev")}
              >
                <Icon name="chevron-left" size={17} />
              </button>
              <button
                type="button"
                className="btn btn-light"
                aria-label="Período siguiente"
                onClick={() => move("next")}
              >
                <Icon name="chevron-right" size={17} />
              </button>
            </Inline>
            <strong className="electoral-calendar__period">{title}</strong>
          </Inline>
          <Inline gap="sm" wrap>
            <SelectControl
              label="Todos los equipos"
              ariaLabel="Filtrar por equipo"
              value={teamFilter}
              onChange={setTeamFilter}
              options={[
                { value: "all", label: "Todos los equipos" },
                ...teams.map((team) => ({ value: team.id, label: team.name })),
              ]}
            />
            <SelectControl
              label="Todos los tipos"
              ariaLabel="Filtrar por tipo"
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: "all", label: "Todos los tipos" },
                ...typeOptions,
              ]}
            />
            <SelectControl
              label="Activos"
              ariaLabel="Filtrar por estado"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "active", label: "Activos" },
                { value: "confirmed", label: "Confirmados" },
                { value: "draft", label: "Borradores" },
                { value: "cancelled", label: "Cancelados" },
                { value: "all", label: "Todos" },
              ]}
            />
            <button
              type="button"
              className={`btn ${mine ? "btn-primary" : "btn-light"}`}
              onClick={() => setMine((current) => !current)}
            >
              Mi agenda
            </button>
          </Inline>
        </section>
        <section className="electoral-calendar__workspace">
          <Stack gap="md" className="electoral-calendar__main">
            <Inline gap="xs" wrap className="electoral-calendar__views">
              {(
                [
                  { key: "dayGridMonth", label: "Mes" },
                  { key: "timeGridWeek", label: "Semana" },
                  { key: "timeGridDay", label: "Día" },
                  { key: "listWeek", label: "Agenda" },
                  { key: "teams", label: "Equipos" },
                  { key: "run", label: "Run of show" },
                ] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`btn ${view === item.key ? "btn-primary" : "btn-light"}`}
                  onClick={() => setCalendarView(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </Inline>
            {view === "teams" ? (
              <TeamPlanner
                teams={teams}
                events={filtered}
                onSelect={setSelected}
              />
            ) : view === "run" ? (
              <RunOfShow events={nextEvents} onSelect={setSelected} />
            ) : (
              <div className="electoral-calendar__calendar">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[
                    dayGridPlugin,
                    timeGridPlugin,
                    listPlugin,
                    interactionPlugin,
                  ]}
                  initialView="dayGridMonth"
                  locale="es"
                  firstDay={1}
                  events={fullEvents}
                  editable={canEditEvents}
                  eventAllow={(_, draggedEvent) =>
                    Boolean(
                      draggedEvent &&
                        (draggedEvent.extendedProps as CalendarEvent).canEdit,
                    )
                  }
                  eventDrop={eventDrop}
                  eventClick={(arg) => {
                    arg.jsEvent.preventDefault();
                    setSelected(arg.event.extendedProps as CalendarEvent);
                  }}
                  dateClick={(arg) => canEditEvents && showCreate(arg.date)}
                  datesSet={(arg) => setTitle(arg.view.title)}
                  headerToolbar={false}
                  height="auto"
                  noEventsContent="No hay eventos en este período"
                />
              </div>
            )}
          </Stack>
          <CalendarAside
            event={selected}
            members={members}
            teams={teams}
            resources={resources}
            canManage={Boolean(selected?.canEdit)}
            currentUser={user}
            onEdit={() => selected && showEdit(selected)}
            onDuplicate={() => selected && duplicate(selected)}
            onCancel={() => void cancel()}
            onDelete={() => void destroy()}
            onClose={() => setSelected(null)}
            base={base}
            onChanged={load}
            onRespond={async (status) => {
              if (!selected || !user) return;
              const response = await authenticatedRequest(
                user,
                `${base}/calendar/${selected.id}/response`,
                { method: "POST", body: JSON.stringify({ status }) },
              );
              if (response.error) {
                setNotice(response.error.message);
                return;
              }
              setNotice(
                status === "confirmed"
                  ? "Confirmaste tu participación."
                  : "Marcaste que no podés participar.",
              );
              await load();
            }}
          />
        </section>
        <section className="electoral-calendar__attention">
          <Inline gap="sm">
            <Icon name="warning" size={19} color="#d97706" />
            <Stack gap="xs">
              <strong>Atención operativa</strong>
              <span>
                {events.filter((event) => event.status === "draft").length}{" "}
                borradores pendientes ·{" "}
                {
                  events.filter((event) =>
                    event.participants.some(
                      (participant) =>
                        participant.required &&
                        participant.status === "pending",
                    ),
                  ).length
                }{" "}
                eventos esperando confirmaciones.
              </span>
            </Stack>
          </Inline>
          {!resources.length && canManage && (
            <span>
              Agregá recursos desde la configuración operativa para reservarlos
              por evento.
            </span>
          )}
        </section>
      </Stack>
      <EventModal
        show={modal}
        saving={saving}
        form={form}
        members={members}
        teams={teams}
        resources={resources}
        conflicts={conflicts}
        typeOptions={typeOptions}
        editing={Boolean(selected)}
        canManagePublication={canManage}
        onHide={() => setModal(false)}
        onChange={setForm}
        onCreateType={createType}
        onToggle={multiToggle}
        onSave={save}
      />
      <TemplateModal
        show={templateModal}
        templates={templates}
        onHide={() => setTemplateModal(false)}
        onUse={(template) => showCreate(undefined, template)}
      />
      <AvailabilityModal
        show={availabilityModal}
        members={members}
        base={base}
        user={user}
        onHide={() => setAvailabilityModal(false)}
      />
      <OperationsModal
        show={operationsModal}
        resources={resources}
        templates={templates}
        base={base}
        user={user}
        onHide={() => setOperationsModal(false)}
        onChanged={load}
      />
      {notice && <Toast message={notice} onClose={() => setNotice("")} />}
    </PageContainer>
  );
}

function CalendarAside({
  event,
  members,
  teams,
  resources,
  canManage,
  currentUser,
  onEdit,
  onDuplicate,
  onCancel,
  onDelete,
  onClose,
  base,
  onChanged,
  onRespond,
}: {
  event: CalendarEvent | null;
  members: Member[];
  teams: Team[];
  resources: Resource[];
  canManage: boolean;
  currentUser: User | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onClose: () => void;
  base: string;
  onChanged: () => Promise<void>;
  onRespond: (status: "confirmed" | "declined") => Promise<void>;
}) {
  if (!event)
    return (
      <aside className="electoral-calendar__aside">
        <EmptyState
          icon="calendar"
          title="Seleccioná un evento"
          description="Vas a ver participantes, recursos y preparación contextual."
        />
      </aside>
    );
  const memberFor = (uid: string) =>
    members.find((member) => member.uid === uid);
  const eventResources = resources.filter((resource) =>
    event.resourceIds.includes(resource.id),
  );
  const eventTeams = teams.filter((team) => event.teamIds.includes(team.id));
  const eventLocation = event.location?.label || event.location?.address;
  const formatEventDate = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      dateStyle: "full",
      timeStyle: event.allDay ? undefined : "short",
    }).format(new Date(value));
  const ownParticipation = event.participants.find(
    (participant) => participant.uid === currentUser?.uid,
  );
  return (
    <aside className="electoral-calendar__aside">
      <Stack gap="lg">
        <Inline gap="sm" className="justify-content-between">
          <span
            className="electoral-calendar__event-type"
            style={{
              backgroundColor: event.isPublication
                ? "#d6008c"
                : (typeColor[event.type] ?? typeColor.event),
            }}
          >
            {event.isPublication
              ? "Publicación"
              : (typeLabels[event.type] ?? "Evento")}
          </span>
          <button
            type="button"
            className="btn btn-light btn-sm"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            <Icon name="close" size={16} />
          </button>
        </Inline>
        <Stack gap="xs">
          <h2>{event.title}</h2>
          <p>{formatEventDate(event.startAt)}</p>
        </Stack>
        <Stack gap="xs">
          <h3>Descripción</h3>
          <p
            className="electoral-calendar__event-description"
            data-testid="calendar-event-description"
          >
            {event.description?.trim() || "Sin descripción cargada."}
          </p>
        </Stack>
        <Stack gap="xs">
          <h3>Detalles</h3>
          <span>Estado: {statusLabel(event.status)}</span>
          <span>Prioridad: {priorityLabel(event.priority)}</span>
          <span>Inicio: {formatEventDate(event.startAt)}</span>
          <span>Fin: {formatEventDate(event.endAt)}</span>
          {event.allDay && <span>Evento de todo el día</span>}
          {event.timezone && <span>Zona horaria: {event.timezone}</span>}
          {eventLocation && (
            <span>
              <i className="feather icon-map-pin" /> Lugar: {eventLocation}
            </span>
          )}
          {event.labels?.length ? (
            <span>Etiquetas: {event.labels.join(", ")}</span>
          ) : null}
        </Stack>
        <Stack gap="sm">
          <h3>Preparación</h3>
          <span>
            {event.preparationMinutes || 0} min antes ·{" "}
            {event.teardownMinutes || 0} min después
          </span>
        </Stack>
        <Stack gap="sm">
          <h3>Participantes</h3>
          {event.participants.length ? (
            event.participants.map((participant) => (
              <Inline gap="xs" key={participant.uid}>
                <span
                  className={`electoral-calendar__confirm electoral-calendar__confirm--${participant.status}`}
                />
                <span>
                  {displayMember(
                    memberFor(participant.uid) ?? { uid: participant.uid },
                  )}
                </span>
                <small>{participant.required ? "Necesario" : "Opcional"}</small>
              </Inline>
            ))
          ) : (
            <span>Sin participantes asignados.</span>
          )}
          {ownParticipation?.status === "pending" && (
            <Inline gap="xs">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void onRespond("confirmed")}
              >
                Confirmar
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => void onRespond("declined")}
              >
                No puedo asistir
              </button>
            </Inline>
          )}
        </Stack>
        <Stack gap="sm">
          <h3>Recursos</h3>
          {eventResources.length ? (
            eventResources.map((resource) => (
              <span key={resource.id}>
                {resource.name} · {resource.type}
              </span>
            ))
          ) : (
            <span>Sin recursos reservados.</span>
          )}
        </Stack>
        {eventTeams.length ? (
          <Stack gap="sm">
            <h3>Equipos</h3>
            {eventTeams.map((team) => (
              <span key={team.id}>{team.name}</span>
            ))}
          </Stack>
        ) : null}
        {event.isPublication && event.linkedUserIds?.length ? (
          <Stack gap="sm">
            <h3>Usuarios vinculados</h3>
            {event.linkedUserIds.map((uid) => (
              <span key={uid}>
                {displayMember(memberFor(uid) ?? { uid })}
              </span>
            ))}
            <span>
              {event.allowLinkedEditing
                ? "Edición permitida"
                : "Solo visualización"}
            </span>
          </Stack>
        ) : null}
        {event.isPublication && (
          <PublicationAttachments
            event={event}
            base={base}
            user={currentUser}
            editable={canManage}
            onChanged={onChanged}
          />
        )}
        {event.runOfShow?.length ? (
          <Stack gap="sm">
            <h3>Run of show</h3>
            {event.runOfShow.slice(0, 4).map((step) => (
              <Inline gap="xs" key={step.id}>
                <small>{step.at || "—"}</small>
                <span>{step.title}</span>
              </Inline>
            ))}
          </Stack>
        ) : null}
        <a
          className="btn btn-outline-primary"
          href={`${apiBaseUrl}${base}/calendar/${event.id}/export.ics`}
          target="_blank"
          rel="noreferrer"
        >
          <i className="feather icon-download" /> Exportar ICS
        </a>
        {canManage && (
          <Stack gap="sm">
            <button type="button" className="btn btn-primary" onClick={onEdit}>
              Editar evento
            </button>
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={onDuplicate}
            >
              Duplicar evento
            </button>
            {event.status !== "cancelled" && (
              <button
                type="button"
                className="btn btn-outline-warning"
                onClick={onCancel}
              >
                Cancelar evento
              </button>
            )}
            <button
              type="button"
              className="btn btn-outline-danger"
              onClick={onDelete}
            >
              Eliminar permanentemente
            </button>
          </Stack>
        )}
      </Stack>
    </aside>
  );
}

function PublicationAttachments({
  event,
  base,
  user,
  editable,
  onChanged,
}: {
  event: CalendarEvent;
  base: string;
  user: User | null;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [attachments, setAttachments] = useState<CalendarAttachment[]>(
    event.attachments ?? [],
  );
  const [saving, setSaving] = useState(false);
  useEffect(
    () => setAttachments(event.attachments ?? []),
    [event.id, event.attachments],
  );
  const upload = async (file?: File) => {
    if (!file || !user) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append("attachment", file);
      const attachment = await authenticatedFetch<CalendarAttachment>(
        user,
        `${base}/calendar/${event.id}/attachments`,
        { method: "POST", body },
      );
      setAttachments((current) => current.concat(attachment));
      await onChanged();
    } finally {
      setSaving(false);
    }
  };
  const remove = async (attachment: CalendarAttachment) => {
    if (!user || !window.confirm(`¿Eliminar ${attachment.name}?`)) return;
    await authenticatedFetch(
      user,
      `${base}/calendar/${event.id}/attachments/${attachment.id}`,
      { method: "DELETE" },
    );
    setAttachments((current) =>
      current.filter((item) => item.id !== attachment.id),
    );
    await onChanged();
  };
  return (
    <Stack gap="sm">
      <Inline gap="sm" className="justify-content-between">
        <h3>Adjuntos</h3>
        {editable && (
          <label className="btn btn-sm btn-outline-primary mb-0">
            {saving ? "Subiendo…" : "Adjuntar archivo"}
            <input
              className="visually-hidden"
              type="file"
              accept="image/*,application/pdf"
              disabled={saving}
              onChange={(input) => void upload(input.target.files?.[0])}
            />
          </label>
        )}
      </Inline>
      {attachments.length ? (
        attachments.map((attachment) => (
          <Inline
            gap="xs"
            key={attachment.id}
            className="electoral-calendar__attachment"
          >
            <a href={attachment.url} target="_blank" rel="noreferrer">
              {attachment.name}
            </a>
            {editable && (
              <button
                type="button"
                className="btn btn-sm btn-light"
                onClick={() => void remove(attachment)}
                aria-label={`Eliminar ${attachment.name}`}
              >
                <i className="feather icon-trash-2" />
              </button>
            )}
          </Inline>
        ))
      ) : (
        <span>Sin adjuntos.</span>
      )}
    </Stack>
  );
}

function TeamPlanner({
  teams,
  events,
  onSelect,
}: {
  teams: Team[];
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  return (
    <section className="electoral-calendar__team-planner">
      {teams.length ? (
        teams.map((team) => (
          <Stack
            gap="sm"
            key={team.id}
            className="electoral-calendar__team-row"
          >
            <strong>{team.name}</strong>
            <Inline gap="sm" wrap>
              {events
                .filter((event) => event.teamIds.includes(team.id))
                .map((event) => (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() => onSelect(event)}
                    className="electoral-calendar__team-event"
                    style={{
                      borderColor: typeColor[event.type] ?? typeColor.event,
                    }}
                  >
                    {event.title}
                    <small>
                      {new Date(event.startAt).toLocaleDateString("es-AR")}
                    </small>
                  </button>
                )) || (
                <span className="text-muted">Sin eventos en el período.</span>
              )}
            </Inline>
          </Stack>
        ))
      ) : (
        <EmptyState
          icon="people"
          title="No hay equipos configurados"
          description="Creá equipos en Organización para planificar su agenda."
        />
      )}
    </section>
  );
}
function RunOfShow({
  events,
  onSelect,
}: {
  events: CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}) {
  const entries = events.flatMap((event) =>
    (event.runOfShow ?? []).map((step) => ({ event, step })),
  );
  return (
    <section className="electoral-calendar__run">
      {entries.length ? (
        <Stack gap="sm">
          {entries.map(({ event, step }) => (
            <button
              type="button"
              key={`${event.id}-${step.id}`}
              onClick={() => onSelect(event)}
              className="electoral-calendar__run-step"
            >
              <Inline gap="md">
                <strong>{step.at || "—"}</strong>
                <Stack gap="xs">
                  <span>{step.title}</span>
                  <small>{event.title}</small>
                </Stack>
              </Inline>
            </button>
          ))}
        </Stack>
      ) : (
        <EmptyState
          icon="list"
          title="No hay run of show próximo"
          description="Agregá pasos de ejecución al editar un evento."
        />
      )}
    </section>
  );
}

function CalendarTypeCombobox({
  value,
  options,
  onChange,
  onCreate,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  onCreate: (label: string) => Promise<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const shownValue = open ? query : selected?.label ?? typeLabel(value);
  const normalizedQuery = query.trim();
  const filtered = options.filter((option) => typeKey(option.label).includes(typeKey(normalizedQuery)));
  const matchesExisting = options.some(
    (option) => typeKey(option.label) === typeKey(normalizedQuery) || typeKey(option.value) === typeKey(normalizedQuery),
  );
  const choose = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };
  const create = async () => {
    const option = await onCreate(normalizedQuery);
    choose(option.value);
  };

  return (
    <div className="calendar-type-combobox" ref={triggerRef}>
      <Inline gap="xs" className="calendar-type-combobox__control">
        <input
          id="calendar-event-type"
          className="form-control"
          value={shownValue}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && normalizedQuery && !matchesExisting) {
              event.preventDefault();
              void create();
            }
          }}
          placeholder="Buscar o crear tipo"
          maxLength={80}
          role="combobox"
          aria-autocomplete="list"
          aria-controls="calendar-event-type-options"
          aria-expanded={open}
          required
        />
        <button
          type="button"
          className="calendar-type-combobox__toggle"
          aria-label="Abrir opciones"
          onClick={() => {
            setOpen((current) => !current);
            setQuery("");
          }}
        >
          <Icon name="chevron-down" size={16} color="#6b86ad" />
        </button>
      </Inline>
      <DropdownPortal
        open={open}
        anchorRef={triggerRef}
        onDismiss={() => setOpen(false)}
        className="calendar-type-combobox__menu"
      >
        {filtered.map((option) => (
          <button
            key={option.value}
            id={`calendar-event-type-option-${option.value}`}
            role="option"
            type="button"
            className={`cd-select-dropdown__option${option.value === value ? " is-active" : ""}`}
            aria-selected={option.value === value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </button>
        ))}
        {normalizedQuery && !matchesExisting && (
          <button
            type="button"
            className="calendar-type-combobox__create"
            onClick={() => void create()}
          >
            Crear tipo “{normalizedQuery}”
          </button>
        )}
        {!filtered.length && !normalizedQuery && (
          <span className="calendar-type-combobox__empty">Sin tipos disponibles.</span>
        )}
      </DropdownPortal>
    </div>
  );
}

function EventModal({
  show,
  saving,
  form,
  members,
  teams,
  resources,
  conflicts,
  typeOptions,
  editing,
  canManagePublication,
  onHide,
  onChange,
  onCreateType,
  onToggle,
  onSave,
}: {
  show: boolean;
  saving: boolean;
  form: FormState;
  members: Member[];
  teams: Team[];
  resources: Resource[];
  conflicts: Array<{ title: string; startAt: string; endAt: string }>;
  typeOptions: Array<{ value: string; label: string }>;
  editing: boolean;
  canManagePublication: boolean;
  onHide: () => void;
  onChange: (value: FormState) => void;
  onCreateType: (label: string) => Promise<{ value: string; label: string }>;
  onToggle: (
    field:
      | "participantIds"
      | "optionalParticipantIds"
      | "teamIds"
      | "resourceIds"
      | "linkedUserIds",
    value: string,
  ) => void;
  onSave: (event: FormEvent, confirmConflicts?: boolean) => Promise<void>;
}) {
  const submit = (event: FormEvent) => void onSave(event);
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title>
            {editing ? "Editar evento" : "Crear evento de campaña"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="lg">
            <div className="row g-3">
              <div className="col-md-8">
                <label className="form-label" htmlFor="calendar-event-title">
                  Título
                </label>
                <input
                  id="calendar-event-title"
                  className="form-control"
                  value={form.title}
                  onChange={(event) =>
                    onChange({ ...form, title: event.target.value })
                  }
                  required
                  autoFocus
                />
              </div>
              <div className="col-md-4">
                <label className="form-label" htmlFor="calendar-event-type">
                  Tipo
                </label>
                <CalendarTypeCombobox
                  value={form.type}
                  options={typeOptions}
                  onChange={(type) => onChange({ ...form, type })}
                  onCreate={onCreateType}
                />
                <small className="form-text text-muted">
                  Buscá un tipo existente o creá uno nuevo desde la lista.
                </small>
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="calendar-event-start">
                  Inicio
                </label>
                <input
                  id="calendar-event-start"
                  className="form-control"
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(event) =>
                    onChange({ ...form, startAt: event.target.value })
                  }
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="calendar-event-end">
                  Fin
                </label>
                <input
                  id="calendar-event-end"
                  className="form-control"
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(event) =>
                    onChange({ ...form, endAt: event.target.value })
                  }
                  required
                />
              </div>
            </div>
            <label className="form-check">
              <input
                className="form-check-input"
                type="checkbox"
                checked={form.allDay}
                onChange={(event) =>
                  onChange({ ...form, allDay: event.target.checked })
                }
              />{" "}
              <span className="form-check-label">Todo el día</span>
            </label>
            <section className="electoral-calendar__modal-section">
              <Stack gap="sm">
                <label className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.isPublication}
                    disabled={editing && !canManagePublication}
                    onChange={(event) =>
                      onChange({ ...form, isPublication: event.target.checked })
                    }
                  />{" "}
                  <span className="form-check-label">
                    <strong>Publicación</strong> · creá una tarea espejo en
                    Planificación
                  </span>
                </label>
                {form.isPublication && canManagePublication && (
                  <>
                    <label className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={form.allowLinkedEditing}
                        onChange={(event) =>
                          onChange({
                            ...form,
                            allowLinkedEditing: event.target.checked,
                          })
                        }
                      />{" "}
                      <span className="form-check-label">
                        Permitir edición a usuarios vinculados
                      </span>
                    </label>
                    <div className="electoral-calendar__checkbox-grid">
                      {members.map((member) => (
                        <label
                          key={`publication-${member.uid}`}
                          className="form-check"
                        >
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={form.linkedUserIds.includes(member.uid)}
                            onChange={() =>
                              onToggle("linkedUserIds", member.uid)
                            }
                          />{" "}
                          <span className="form-check-label">
                            {displayMember(member)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </Stack>
            </section>
            <div>
              <label className="form-label" htmlFor="calendar-event-location">
                Lugar
              </label>
              <input
                id="calendar-event-location"
                className="form-control"
                value={form.location}
                onChange={(event) =>
                  onChange({ ...form, location: event.target.value })
                }
                placeholder="Dirección, sede o enlace virtual"
              />
            </div>
            <div>
              <label
                className="form-label"
                htmlFor="calendar-event-description"
              >
                Descripción
              </label>
              <textarea
                id="calendar-event-description"
                className="form-control"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  onChange({ ...form, description: event.target.value })
                }
              />
            </div>
            <section className="electoral-calendar__modal-section">
              <Stack gap="sm">
                <h3>Participantes</h3>
                {members.length ? (
                  <div className="electoral-calendar__checkbox-grid">
                    {members.map((member) => (
                      <label key={member.uid} className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={form.participantIds.includes(member.uid)}
                          onChange={() =>
                            onToggle("participantIds", member.uid)
                          }
                        />{" "}
                        <span className="form-check-label">
                          {displayMember(member)}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">
                    No hay acceso al listado de miembros para este rol.
                  </span>
                )}
              </Stack>
            </section>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Equipos</label>
                <div className="electoral-calendar__checkbox-grid">
                  {teams.map((team) => (
                    <label key={team.id} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={form.teamIds.includes(team.id)}
                        onChange={() => onToggle("teamIds", team.id)}
                      />{" "}
                      <span className="form-check-label">{team.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-md-6">
                <label className="form-label">Recursos</label>
                <div className="electoral-calendar__checkbox-grid">
                  {resources.map((resource) => (
                    <label key={resource.id} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={form.resourceIds.includes(resource.id)}
                        onChange={() => onToggle("resourceIds", resource.id)}
                      />{" "}
                      <span className="form-check-label">
                        {resource.name} ({resource.quantity})
                      </span>
                    </label>
                  )) || (
                    <span className="text-muted">
                      No hay recursos configurados.
                    </span>
                  )}
                </div>
              </div>
            </div>
            {conflicts.length > 0 && (
              <section className="alert alert-warning">
                <Stack gap="sm">
                  <strong>Conflictos detectados</strong>
                  {conflicts.map((conflict) => (
                    <span key={`${conflict.title}-${conflict.startAt}`}>
                      {conflict.title} ·{" "}
                      {new Date(conflict.startAt).toLocaleString("es-AR")}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="btn btn-warning"
                    onClick={(event) =>
                      void onSave(event as unknown as FormEvent, true)
                    }
                  >
                    Guardar de todos modos
                  </button>
                </Stack>
              </section>
            )}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" type="button" onClick={onHide}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar evento"}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}
function TemplateModal({
  show,
  templates,
  onHide,
  onUse,
}: {
  show: boolean;
  templates: Template[];
  onHide: () => void;
  onUse: (template: Template) => void;
}) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Crear desde plantilla</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {templates.length ? (
          <Stack gap="sm">
            {templates.map((template) => (
              <button
                type="button"
                key={template.id}
                className="electoral-calendar__template"
                onClick={() => onUse(template)}
              >
                <Stack gap="xs">
                  <strong>{template.name}</strong>
                  <span>
                    {template.event.title || "Evento de campaña"} ·{" "}
                    {template.event.durationMinutes || 60} min
                  </span>
                </Stack>
              </button>
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon="doc"
            title="No hay plantillas"
            description="Las plantillas operativas se podrán crear desde la configuración del calendario."
          />
        )}
      </Modal.Body>
    </Modal>
  );
}

function AvailabilityModal({
  show,
  members,
  base,
  user,
  onHide,
}: {
  show: boolean;
  members: Member[];
  base: string;
  user: any;
  onHide: () => void;
}) {
  const [startAt, setStartAt] = useState(() => initialForm().startAt);
  const [endAt, setEndAt] = useState(() => initialForm().endAt);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [result, setResult] = useState<Array<{
    uid: string;
    busy: Array<{ title: string; startAt: string; endAt: string }>;
    availabilityKnown: boolean;
  }> | null>(null);
  const [error, setError] = useState("");
  const toggle = (uid: string) =>
    setParticipantIds((current) =>
      current.includes(uid)
        ? current.filter((entry) => entry !== uid)
        : current.concat(uid),
    );
  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");
    setResult(null);
    const response = await authenticatedRequest<
      Array<{
        uid: string;
        busy: Array<{ title: string; startAt: string; endAt: string }>;
        availabilityKnown: boolean;
      }>
    >(user, `${base}/calendar/availability`, {
      method: "POST",
      body: JSON.stringify({
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        participantIds,
      }),
    });
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setResult(response.data ?? []);
  };
  return (
    <Modal show={show} onHide={onHide} centered>
      <form onSubmit={(event) => void search(event)}>
        <Modal.Header closeButton>
          <Modal.Title>Encontrar horario</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="lg">
            <p className="text-muted mb-0">
              La consulta usa la agenda conocida de esta campaña. La ausencia de
              datos externos no prueba disponibilidad.
            </p>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label" htmlFor="availability-start">
                  Desde
                </label>
                <input
                  id="availability-start"
                  className="form-control"
                  type="datetime-local"
                  required
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label" htmlFor="availability-end">
                  Hasta
                </label>
                <input
                  id="availability-end"
                  className="form-control"
                  type="datetime-local"
                  required
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </div>
            <Stack gap="sm">
              <strong>Participantes a consultar</strong>
              {members.length ? (
                <div className="electoral-calendar__checkbox-grid">
                  {members.map((member) => (
                    <label key={member.uid} className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={participantIds.includes(member.uid)}
                        onChange={() => toggle(member.uid)}
                      />
                      <span className="form-check-label">
                        {displayMember(member)}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <span className="text-muted">No hay miembros disponibles.</span>
              )}
            </Stack>
            {error && <div className="alert alert-danger mb-0">{error}</div>}
            {result && (
              <Stack gap="sm">
                <strong>Resultado</strong>
                {result.length ? (
                  result.map((entry) => (
                    <div
                      key={entry.uid}
                      className="electoral-calendar__availability"
                    >
                      <strong>
                        {displayMember(
                          members.find(
                            (member) => member.uid === entry.uid,
                          ) ?? { uid: entry.uid },
                        )}
                      </strong>
                      {entry.busy.length ? (
                        <span>
                          Ocupado:{" "}
                          {entry.busy.map((busy) => busy.title).join(", ")}
                        </span>
                      ) : (
                        <span>Sin bloqueos en el alcance consultado.</span>
                      )}
                    </div>
                  ))
                ) : (
                  <span className="text-muted">
                    Elegí participantes para consultar.
                  </span>
                )}
              </Stack>
            )}
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="light" type="button" onClick={onHide}>
            Cerrar
          </Button>
          <Button type="submit">Consultar</Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

function OperationsModal({
  show,
  resources,
  templates,
  base,
  user,
  onHide,
  onChanged,
}: {
  show: boolean;
  resources: Resource[];
  templates: Template[];
  base: string;
  user: any;
  onHide: () => void;
  onChanged: () => Promise<void>;
}) {
  const [resourceName, setResourceName] = useState("");
  const [resourceType, setResourceType] = useState("espacio");
  const [resourceQuantity, setResourceQuantity] = useState("1");
  const [templateName, setTemplateName] = useState("");
  const [templateTitle, setTemplateTitle] = useState("");
  const [templateDuration, setTemplateDuration] = useState("60");
  const [error, setError] = useState("");
  const addResource = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");
    const response = await authenticatedRequest(
      user,
      `${base}/calendar/resources`,
      {
        method: "POST",
        body: JSON.stringify({
          name: resourceName,
          type: resourceType,
          quantity: Number(resourceQuantity),
        }),
      },
    );
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setResourceName("");
    await onChanged();
  };
  const addTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setError("");
    const response = await authenticatedRequest(
      user,
      `${base}/calendar/templates`,
      {
        method: "POST",
        body: JSON.stringify({
          name: templateName,
          event: {
            title: templateTitle,
            durationMinutes: Number(templateDuration),
          },
        }),
      },
    );
    if (response.error) {
      setError(response.error.message);
      return;
    }
    setTemplateName("");
    setTemplateTitle("");
    await onChanged();
  };
  const remove = async (kind: "resources" | "templates", id: string) => {
    if (!user || !window.confirm("¿Quitar este elemento?")) return;
    const response = await authenticatedRequest(
      user,
      `${base}/calendar/${kind}/${id}`,
      { method: "DELETE" },
    );
    if (response.error) {
      setError(response.error.message);
      return;
    }
    await onChanged();
  };
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Configuración operativa</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Stack gap="xl">
          <Stack gap="sm">
            <Inline gap="sm" className="justify-content-between">
              <h3 className="mb-0">Recursos</h3>
              <span className="text-muted">Espacios, vehículos y equipos</span>
            </Inline>
            {resources.length ? (
              <Stack gap="xs">
                {resources.map((resource) => (
                  <Inline
                    gap="sm"
                    key={resource.id}
                    className="electoral-calendar__operations-row"
                  >
                    <span>
                      <strong>{resource.name}</strong> · {resource.type} ·
                      capacidad {resource.quantity}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => void remove("resources", resource.id)}
                    >
                      Quitar
                    </button>
                  </Inline>
                ))}
              </Stack>
            ) : (
              <span className="text-muted">
                Todavía no hay recursos configurados.
              </span>
            )}
            <form
              onSubmit={(event) => void addResource(event)}
              className="row g-2"
            >
              <div className="col-md-5">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-resource-name"
                >
                  Nombre del recurso
                </label>
                <input
                  id="calendar-resource-name"
                  className="form-control"
                  value={resourceName}
                  onChange={(event) => setResourceName(event.target.value)}
                  placeholder="Nombre del recurso"
                  required
                />
              </div>
              <div className="col-md-3">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-resource-type"
                >
                  Tipo de recurso
                </label>
                <input
                  id="calendar-resource-type"
                  className="form-control"
                  value={resourceType}
                  onChange={(event) => setResourceType(event.target.value)}
                  placeholder="Tipo"
                  required
                />
              </div>
              <div className="col-md-2">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-resource-quantity"
                >
                  Capacidad del recurso
                </label>
                <input
                  id="calendar-resource-quantity"
                  className="form-control"
                  value={resourceQuantity}
                  onChange={(event) => setResourceQuantity(event.target.value)}
                  type="number"
                  min="1"
                  required
                />
              </div>
              <div className="col-md-2">
                <button className="btn btn-outline-primary w-100" type="submit">
                  Agregar recurso
                </button>
              </div>
            </form>
          </Stack>
          <Stack gap="sm">
            <Inline gap="sm" className="justify-content-between">
              <h3 className="mb-0">Plantillas</h3>
              <span className="text-muted">
                Base para actividades repetibles
              </span>
            </Inline>
            {templates.length ? (
              <Stack gap="xs">
                {templates.map((template) => (
                  <Inline
                    gap="sm"
                    key={template.id}
                    className="electoral-calendar__operations-row"
                  >
                    <span>
                      <strong>{template.name}</strong> ·{" "}
                      {template.event.title || "Sin título"} ·{" "}
                      {template.event.durationMinutes || 60} min
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => void remove("templates", template.id)}
                    >
                      Quitar
                    </button>
                  </Inline>
                ))}
              </Stack>
            ) : (
              <span className="text-muted">
                Todavía no hay plantillas configuradas.
              </span>
            )}
            <form
              onSubmit={(event) => void addTemplate(event)}
              className="row g-2"
            >
              <div className="col-md-4">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-template-name"
                >
                  Nombre de plantilla
                </label>
                <input
                  id="calendar-template-name"
                  className="form-control"
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  placeholder="Nombre de plantilla"
                  required
                />
              </div>
              <div className="col-md-4">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-template-title"
                >
                  Título sugerido
                </label>
                <input
                  id="calendar-template-title"
                  className="form-control"
                  value={templateTitle}
                  onChange={(event) => setTemplateTitle(event.target.value)}
                  placeholder="Título sugerido"
                  required
                />
              </div>
              <div className="col-md-2">
                <label
                  className="visually-hidden"
                  htmlFor="calendar-template-duration"
                >
                  Duración en minutos
                </label>
                <input
                  id="calendar-template-duration"
                  className="form-control"
                  value={templateDuration}
                  onChange={(event) => setTemplateDuration(event.target.value)}
                  type="number"
                  min="15"
                  required
                />
              </div>
              <div className="col-md-2">
                <button className="btn btn-outline-primary w-100" type="submit">
                  Agregar plantilla
                </button>
              </div>
            </form>
          </Stack>
          {error && <div className="alert alert-danger mb-0">{error}</div>}
        </Stack>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="light" onClick={onHide}>
          Cerrar
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
