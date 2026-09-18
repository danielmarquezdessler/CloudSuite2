import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "react-bootstrap";
import ReactApexChart from "react-apexcharts";
import Cropper, { Area } from "react-easy-crop";
import { useAuth } from "../../context/AuthContext";
import { useActiveCampaign } from "../../context/CampaignContext";
import { useCampaign } from "./Organization/useCampaign";
import { authenticatedFetch, useAuthenticatedQuery } from "../../lib/api";
import PageContainer from "../../components/Shared/PageContainer";
import HeroBanner from "../../components/Shared/HeroBanner";
import ContentPanel from "../../components/Shared/ContentPanel";
import EmptyState from "../../components/Shared/EmptyState";
import Inline from "../../components/Shared/Inline";
import Stack from "../../components/Shared/Stack";
import SelectControl from "../../components/Shared/SelectControl";
import PrimaryButton from "../../components/Shared/PrimaryButton";
import KpiCard from "../../components/Shared/KpiCard";
import { Toast } from "../../components/Toast";
import { firestore } from "../../lib/firebase";

type Candidate = {
  id?: string;
  name: string;
  party: string;
  photoUrl?: string | null;
  linkedToPrincipal: boolean;
  order?: number;
};
type CandidateRecord = {
  id: string;
  name: string;
  party?: string | null;
  photoUrl?: string | null;
  isPrincipal?: boolean;
};
type Member = { uid: string; displayName?: string; email: string };
type Margin = {
  enabled: boolean;
  populationSize: number | "";
  confidenceLevel: 80 | 85 | 90 | 95 | 99;
  sampleSize: number | "";
  computedMargin?: number | null;
};
type VoteStream = {
  id: string;
  name: string;
  electoralSystem: string;
  location: string;
  date: string;
  status: "pendiente" | "activa" | "cerrada";
  totalElectorsOrEstimatedVotes?: number | null;
  marginOfError?: Margin;
  winnerCandidateId?: string | null;
  liveResults?: { totals?: Record<string, number>; totalVotes?: number };
  candidates?: Candidate[];
  subLocations?: Array<{ id: string; name: string }>;
  genderOptions?: Array<{ id: string; name: string }>;
  ageRanges?: Array<{ id: string; name: string }>;
  agents?: Array<{ id: string }>;
  submissions?: Submission[];
};
type Submission = {
  id: string;
  subLocationId?: string;
  genderId?: string;
  ageRangeId?: string;
  votesByCandidate?: Record<string, number>;
};
const systems = [
  { value: "mayoritario_uninominal", label: "Mayoritario uninominal" },
  { value: "votacion_bloque", label: "Votación por bloque" },
  { value: "segunda_vuelta", label: "Segunda vuelta" },
  { value: "proporcional_plurinominal", label: "Proporcional plurinominal" },
  { value: "orden_preferencia", label: "Orden de preferencia" },
  { value: "mixto", label: "Mixto" },
];
const zValues: Record<number, number> = {
  80: 1.28,
  85: 1.44,
  90: 1.64,
  95: 1.96,
  99: 2.58,
};
const blankMargin = (): Margin => ({
  enabled: false,
  populationSize: "",
  confidenceLevel: 95,
  sampleSize: "",
  computedMargin: null,
});
const blankCandidate = (): Candidate => ({
  name: "",
  party: "",
  linkedToPrincipal: false,
});
const MAX_CANDIDATE_PHOTO_BYTES = 8 * 1024 * 1024;
const formatSystem = (value: string) =>
  systems.find((system) => system.value === value)?.label ?? value;
const calculateMargin = (margin: Margin) => {
  const population = Number(margin.populationSize);
  const sample = Number(margin.sampleSize);
  if (!margin.enabled || population < 2 || sample < 1 || sample > population)
    return null;
  return (
    Math.round(
      Math.sqrt(0.25 / sample) *
        zValues[margin.confidenceLevel] *
        Math.sqrt((population - sample) / (population - 1)) *
        10_000,
    ) / 100
  );
};
const formatMargin = (margin: Margin) => {
  const computed = calculateMargin(margin);
  return computed === null ? "Completá los datos" : `±${computed.toFixed(2)}%`;
};
function TagsField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setText("");
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  };
  return (
    <Stack gap="xs">
      <label className="form-label mb-0">{label}</label>
      <Inline gap="xs" wrap className="vote-tags">
        {values.map((value) => (
          <button
            type="button"
            className="vote-tag"
            key={value}
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
            <span aria-hidden>×</span>
          </button>
        ))}
      </Inline>
      <input
        className="form-control"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={keyDown}
        onBlur={add}
        placeholder={placeholder}
      />
    </Stack>
  );
}
function GenderField({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const add = (raw: string) => {
    const value = raw.trim();
    if (value && !values.includes(value)) onChange([...values, value]);
    setCustom("");
  };
  return (
    <Stack gap="xs" className="vote-option-field">
      <label className="form-label mb-0">Género</label>
      <Inline gap="xs" wrap className="vote-tags">
        {values.map((value) => (
          <button
            type="button"
            className="vote-tag"
            key={value}
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
            <span aria-hidden>×</span>
          </button>
        ))}
      </Inline>
      <Inline gap="xs" className="vote-option-field__controls">
        <SelectControl
          ariaLabel="Agregar género predefinido"
          label="Seleccioná una opción"
          value=""
          onChange={add}
          options={[
            { value: "", label: "Seleccioná una opción", disabled: true },
            ...["Femenino", "Masculino", "No especificado"].map((value) => ({
              value,
              label: value,
              disabled: values.includes(value),
            })),
          ]}
        />
        <input
          aria-label="Agregar género personalizado"
          className="form-control"
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add(custom);
            }
          }}
          onBlur={() => add(custom)}
          placeholder="Agregar otro valor"
        />
      </Inline>
    </Stack>
  );
}
function CandidateAvatar({
  candidate,
  size = "normal",
}: {
  candidate: Candidate;
  size?: "normal" | "large";
}) {
  return candidate.photoUrl ? (
    <img
      className={`vote-avatar vote-avatar--${size}`}
      src={candidate.photoUrl}
      alt=""
    />
  ) : (
    <span className={`vote-avatar vote-avatar--${size}`}>
      {candidate.name.slice(0, 2).toUpperCase() || "?"}
    </span>
  );
}

async function cropCandidatePhoto(source: string, area: Area) {
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No pudimos leer la imagen."));
  });
  const size = Math.min(700, Math.max(1, Math.round(Math.max(area.width, area.height))));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")!
    .drawImage(image, area.x, area.y, area.width, area.height, 0, 0, size, size);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No pudimos recortar la imagen."))),
      "image/jpeg",
      0.84,
    ),
  );
}

function CandidatePhotoCropModal({
  candidate,
  saving,
  onClose,
  onSave,
}: {
  candidate: Candidate | null;
  saving: boolean;
  onClose: () => void;
  onSave: (photo: Blob) => Promise<void>;
}) {
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setSource("");
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    setPhoto(null);
    setError("");
  }, [candidate?.id]);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_CANDIDATE_PHOTO_BYTES) {
      setError(
        !file.type.startsWith("image/")
          ? "La foto debe ser una imagen."
          : "La imagen no puede superar los 8 MB.",
      );
      event.target.value = "";
      return;
    }
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setPhoto(null);
    setError("");
  };
  const confirmCrop = async () => {
    if (!source || !area) return;
    try {
      const cropped = await cropCandidatePhoto(source, area);
      if (cropped.size > MAX_CANDIDATE_PHOTO_BYTES) {
        throw new Error("La imagen recortada no puede superar los 8 MB.");
      }
      setPhoto(cropped);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos recortar la imagen.");
    }
  };
  const save = async () => {
    if (!photo) return;
    try {
      await onSave(photo);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos subir la foto.");
    }
  };

  return (
    <Modal show={Boolean(candidate)} size="lg" centered onHide={() => !saving && onClose()}>
      <Modal.Header closeButton>
        <Modal.Title>Foto de {candidate?.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Stack gap="md">
          <Stack gap="xs">
            <label className="form-label" htmlFor="vote-stream-candidate-photo">
              Elegí una imagen
            </label>
            <input
              id="vote-stream-candidate-photo"
              aria-label="Foto de candidato"
              type="file"
              accept="image/*"
              className="form-control"
              onChange={choose}
            />
            <small className="text-muted">JPG, PNG o WebP. Máximo 8 MB.</small>
          </Stack>
          {source && (
            <Stack gap="sm">
              <div className="vote-candidate-cropper">
                <Cropper
                  image={source}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={(value) => { setCrop(value); setPhoto(null); }}
                  onZoomChange={(value) => { setZoom(value); setPhoto(null); }}
                  onCropComplete={(_, pixels) => setArea(pixels)}
                />
              </div>
              <Inline gap="sm" wrap>
                <input
                  aria-label="Zoom de foto de candidato"
                  type="range"
                  min="1"
                  max="3"
                  step="0.1"
                  value={zoom}
                  onChange={(event) => { setZoom(Number(event.target.value)); setPhoto(null); }}
                />
                <button type="button" className="btn btn-outline-primary" onClick={() => void confirmCrop()}>
                  Confirmar recorte
                </button>
                {photo && <span className="text-success small">Recorte listo para subir</span>}
              </Inline>
            </Stack>
          )}
          {error && <span className="text-danger small">{error}</span>}
        </Stack>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-light" disabled={saving} onClick={onClose}>
          Cancelar
        </button>
        <PrimaryButton icon="plus" disabled={!photo || saving} onClick={() => void save()}>
          {saving ? "Subiendo…" : "Subir foto recortada"}
        </PrimaryButton>
      </Modal.Footer>
    </Modal>
  );
}
function VoteStreamGate({ children }: { children: React.ReactNode }) {
  const { enabledAddons } = useActiveCampaign();
  if (enabledAddons.voteStream) return <>{children}</>;
  return (
    <PageContainer>
      <EmptyState
        icon="target"
        title="Vote Stream no está habilitado"
        description="Pedile a un administrador global que habilite este add-on."
      />
    </PageContainer>
  );
}

export default function VoteStreamList() {
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const { enabledAddons, role } = useActiveCampaign();
  const base = campaign
    ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/vote-streams`
    : null;
  const streamsQ = useAuthenticatedQuery<VoteStream[]>(
    user,
    enabledAddons.voteStream && base ? base : null,
    [base, enabledAddons.voteStream],
  );
  const candidatesQ = useAuthenticatedQuery<CandidateRecord[]>(
    user,
    enabledAddons.voteStream && campaign
      ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/candidates`
      : null,
    [campaign?.campId, campaign?.orgId, enabledAddons.voteStream],
  );
  const membersQ = useAuthenticatedQuery<Member[]>(
    user,
    enabledAddons.voteStream && base ? `${base}/agents` : null,
    [base, enabledAddons.voteStream],
  );
  const [show, setShow] = useState(false);
  const [editingStream, setEditingStream] = useState<VoteStream | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    variant: "success" | "danger";
  } | null>(null);
  const [name, setName] = useState("");
  const [system, setSystem] = useState("mayoritario_uninominal");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [candidates, setCandidates] = useState<Candidate[]>([blankCandidate()]);
  const [subLocations, setSubLocations] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [ages, setAges] = useState<string[]>([]);
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [margin, setMargin] = useState<Margin>(blankMargin());
  const principal = (candidatesQ.data ?? []).find(
    (candidate) => candidate.isPrincipal,
  );
  const canManage = ["cliente", "admin"].includes(role);
  const agents = membersQ.data?.length
    ? membersQ.data
    : user
      ? [
          {
            uid: user.uid,
            displayName: user.displayName ?? undefined,
            email: user.email ?? "",
          },
        ]
      : [];
  const linkedPrincipalIndex = candidates.findIndex(
    (candidate) => candidate.linkedToPrincipal,
  );
  const reset = () => {
    setName("");
    setSystem("mayoritario_uninominal");
    setLocation("");
    setDate(new Date().toISOString().slice(0, 10));
    setCandidates([blankCandidate()]);
    setSubLocations([]);
    setGenders([]);
    setAges([]);
    setAgentIds([]);
    setMargin(blankMargin());
  };
  const openCreate = () => {
    reset();
    setEditingStream(null);
    setShow(true);
  };
  const openEdit = async (stream: VoteStream) => {
    if (!user || !base) return;
    setSaving(true);
    try {
      const complete = await authenticatedFetch<VoteStream>(user, `${base}/${stream.id}`);
      setEditingStream(complete);
      setName(complete.name);
      setSystem(complete.electoralSystem);
      setLocation(complete.location);
      setDate(complete.date);
      setCandidates((complete.candidates ?? []).map((candidate) => ({ ...candidate, party: candidate.party ?? "", linkedToPrincipal: candidate.linkedToPrincipal === true })));
      setSubLocations((complete.subLocations ?? []).map((item) => item.name));
      setGenders((complete.genderOptions ?? []).map((item) => item.name));
      setAges((complete.ageRanges ?? []).map((item) => item.name));
      setAgentIds((complete.agents ?? []).map((agent) => agent.id));
      setMargin(complete.marginOfError ?? blankMargin());
      setShow(true);
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "No pudimos abrir la Stream para editar.", variant: "danger" });
    } finally {
      setSaving(false);
    }
  };
  const removeFromList = async (stream: VoteStream) => {
    if (!user || !base || !window.confirm(`¿Eliminar “${stream.name}”? Esta acción no se puede deshacer.`)) return;
    try {
      await authenticatedFetch(user, `${base}/${stream.id}`, { method: "DELETE" });
      await streamsQ.reload();
      setNotice({ message: "Stream eliminada.", variant: "success" });
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "No pudimos eliminar la Stream.", variant: "danger" });
    }
  };
  const setCandidate = (index: number, next: Partial<Candidate>) =>
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index ? { ...candidate, ...next } : candidate,
      ),
    );
  const linkPrincipal = (index: number) => {
    if (!principal)
      return setNotice({
        message: "Definí primero el Candidato Principal de la campaña.",
        variant: "danger",
      });
    if (linkedPrincipalIndex !== -1 && linkedPrincipalIndex !== index) return;
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? {
              name: principal.name,
              party: principal.party ?? "",
              photoUrl: principal.photoUrl,
              linkedToPrincipal: true,
            }
          : candidate,
      ),
    );
  };
  const unlinkPrincipal = (index: number) =>
    setCandidates((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? { ...candidate, photoUrl: null, linkedToPrincipal: false }
          : candidate,
      ),
    );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !base) return;
    setSaving(true);
    try {
      await authenticatedFetch(user, editingStream ? `${base}/${editingStream.id}` : base, {
        method: editingStream ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          electoralSystem: system,
          location,
          date,
          candidates,
          subLocations,
          genderOptions: genders,
          ageRanges: ages,
          agentIds,
          marginOfError: { ...margin, computedMargin: calculateMargin(margin) },
        }),
      });
      await streamsQ.reload();
      setShow(false); reset(); setEditingStream(null);
      setNotice({
        message: editingStream ? "Stream actualizada." : "Vote Stream creada y lista para activar.",
        variant: "success",
      });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "No pudimos crear la Vote Stream.",
        variant: "danger",
      });
    } finally {
      setSaving(false);
    }
  };
  return (
    <VoteStreamGate>
      <PageContainer>
        <Stack gap="lg">
          <HeroBanner
            icon="target"
            eyebrow="RESULTADOS ELECTORALES"
            title="Vote Stream"
            subtitle="Centralizá la carga y el seguimiento de resultados en tiempo real."
            ctaLabel={canManage ? "Stream" : undefined}
            onCtaClick={openCreate}
            tags={[
              {
                icon: "bar-chart-2",
                label: `${streamsQ.data?.length ?? 0} streams`,
              },
              { icon: "users", label: "Agentes asignables" },
            ]}
          />
          <ContentPanel
            icon="target"
            title="Tus Streams electorales"
            subtitle="Cada jornada mantiene sus candidatos, segmentos y resultados independientes."
          >
            {streamsQ.loading ? (
              <EmptyState
                icon="target"
                title="Cargando Vote Streams"
                description="Estamos preparando la campaña."
              />
            ) : streamsQ.data?.length ? (
              <div className="vote-stream-grid">
                {streamsQ.data.map((stream) => (
                  <article
                    key={stream.id}
                    className="vote-stream-card"
                    data-card="true"
                  >
                    <Stack gap="sm">
                      <Inline gap="sm" className="justify-content-between">
                        <span className={`vote-status is-${stream.status}`}>
                          {stream.status}
                        </span>
                        <small>{stream.date}</small>
                      </Inline>
                      <Stack gap="xs">
                        <strong>{stream.name}</strong>
                        <small>
                          {stream.location} ·{" "}
                          {formatSystem(stream.electoralSystem)}
                        </small>
                      </Stack>
                      <Inline gap="sm" wrap className="vote-stream-card__actions">
                        <Link
                          className="btn btn-primary btn-sm"
                          to={`/vote-stream/${stream.id}`}
                        >
                          Visualizar
                        </Link>
                        <Link className="btn btn-outline-primary btn-sm" to={`/vote-stream/${stream.id}#seguimiento-agentes`}>Gerenciar agentes</Link>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void openEdit(stream)}>Editar</button>
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => void removeFromList(stream)}>Eliminar</button>
                      </Inline>
                    </Stack>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="target"
                title="Todavía no hay Vote Streams"
                description="Creá la primera jornada para preparar candidatos, segmentos y agentes."
                ctaLabel={canManage ? "Stream" : undefined}
                onCtaClick={canManage ? openCreate : undefined}
              />
            )}
          </ContentPanel>
          <Modal
            show={show}
            size="xl"
            dialogClassName="vote-stream-modal"
            onHide={() => !saving && setShow(false)}
          >
            <form onSubmit={submit}>
              <Modal.Header closeButton className="vote-stream-modal__header">
                <Inline gap="md" className="vote-stream-modal__heading">
                  <span
                    className="vote-stream-modal__heading-icon"
                    aria-hidden="true"
                  >
                    <i className="ph-duotone ph-chart-bar" />
                  </span>
                  <Stack gap="xs">
                    <Modal.Title>{editingStream ? "Editar Stream" : "Nueva Stream"}</Modal.Title>
                    <span>Configurá los detalles de tu encuesta electoral</span>
                  </Stack>
                </Inline>
              </Modal.Header>
              <Modal.Body className="vote-stream-modal__body">
                <Stack gap="md">
                  <Stack gap="xs" className="vote-stream-modal__top-grid">
                    <Stack gap="xs" className="vote-stream-modal__field">
                      <label className="form-label mb-0">Nombre</label>
                      <input
                        className="form-control"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Ej. Elección municipal 2026"
                        required
                      />
                    </Stack>
                    <Stack gap="xs" className="vote-stream-modal__field">
                      <label className="form-label mb-0">
                        Sistema electoral
                      </label>
                      <SelectControl
                        ariaLabel="Sistema electoral"
                        label={formatSystem(system)}
                        value={system}
                        onChange={setSystem}
                        options={systems}
                      />
                    </Stack>
                    <Stack gap="xs" className="vote-stream-modal__field">
                      <label className="form-label mb-0">Localización</label>
                      <input
                        className="form-control"
                        value={location}
                        onChange={(event) => setLocation(event.target.value)}
                        placeholder="Localidad o distrito"
                        required
                      />
                    </Stack>
                    <Stack gap="xs" className="vote-stream-modal__field">
                      <label className="form-label mb-0">Fecha</label>
                      <input
                        type="date"
                        className="form-control"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </Stack>
                  </Stack>
                  <Stack gap="sm" className="vote-stream-modal__section">
                    <Inline
                      gap="sm"
                      className="justify-content-between vote-stream-modal__section-heading"
                    >
                      <Inline gap="sm">
                        <span
                          className="vote-stream-modal__section-icon"
                          aria-hidden="true"
                        >
                          <i className="ph-duotone ph-users-three" />
                        </span>
                        <Stack gap="xs">
                          <strong>Candidatos</strong>
                          <small>
                            Vinculá a uno con el Candidato Principal si
                            corresponde.
                          </small>
                        </Stack>
                      </Inline>
                      <button
                        className="btn btn-outline-primary vote-stream-modal__add"
                        type="button"
                        disabled={candidates.length >= 10}
                        onClick={() =>
                          setCandidates([...candidates, blankCandidate()])
                        }
                      >
                        + Agregar candidato
                      </button>
                    </Inline>
                    <Stack gap="xs">
                      {candidates.map((candidate, index) => (
                        <Inline
                          gap="sm"
                          wrap
                          className="vote-candidate-editor"
                          key={index}
                        >
                          <CandidateAvatar candidate={candidate} />
                          <input
                            aria-label={`Nombre del candidato ${index + 1}`}
                            className="form-control"
                            disabled={candidate.linkedToPrincipal}
                            value={candidate.name}
                            onChange={(event) =>
                              setCandidate(index, { name: event.target.value })
                            }
                            placeholder="Nombre y apellido"
                            required={!candidate.linkedToPrincipal}
                          />
                          <input
                            aria-label={`Partido del candidato ${index + 1}`}
                            className="form-control"
                            disabled={candidate.linkedToPrincipal}
                            value={candidate.party}
                            onChange={(event) =>
                              setCandidate(index, { party: event.target.value })
                            }
                            placeholder="Partido"
                          />
                          {candidate.linkedToPrincipal ? (
                            <Inline
                              gap="xs"
                              className="vote-candidate-editor__linked"
                            >
                              <span className="vote-candidate-editor__linked-label">
                                Vinculado ✓
                              </span>
                              <button
                                className="btn btn-sm btn-outline-secondary"
                                type="button"
                                onClick={() => unlinkPrincipal(index)}
                              >
                                Desvincular
                              </button>
                            </Inline>
                          ) : linkedPrincipalIndex === -1 ? (
                            <button
                              className="btn btn-sm btn-outline-primary"
                              type="button"
                              onClick={() => linkPrincipal(index)}
                              disabled={!principal}
                            >
                              Vincular Principal
                            </button>
                          ) : null}
                          {candidates.length > 1 && (
                            <button
                              className="btn btn-sm btn-outline-danger"
                              type="button"
                              onClick={() =>
                                setCandidates(
                                  candidates.filter(
                                    (_, candidateIndex) =>
                                      candidateIndex !== index,
                                  ),
                                )
                              }
                            >
                              Quitar
                            </button>
                          )}
                        </Inline>
                      ))}
                    </Stack>
                  </Stack>
                  <Stack gap="xs" className="vote-stream-modal__option-grid">
                    <TagsField
                      label="Sub ubicaciones"
                      values={subLocations}
                      onChange={setSubLocations}
                      placeholder="Ej. Escuela 12 + Enter"
                    />
                    <GenderField values={genders} onChange={setGenders} />
                    <TagsField
                      label="Rango de edad"
                      values={ages}
                      onChange={setAges}
                      placeholder="Ej. 50-70 + Enter"
                    />
                  </Stack>
                  <Stack
                    gap="sm"
                    className="vote-stream-modal__section vote-stream-modal__agents"
                  >
                    <Inline gap="sm">
                      <span
                        className="vote-stream-modal__section-icon"
                        aria-hidden="true"
                      >
                        <i className="ph-duotone ph-users-three" />
                      </span>
                      <strong>Agentes de Sondeo</strong>
                    </Inline>
                    <Inline gap="sm" wrap>
                      {agents.map((member) => (
                        <label className="vote-agent" key={member.uid}>
                          <input
                            type="checkbox"
                            checked={agentIds.includes(member.uid)}
                            onChange={() =>
                              setAgentIds(
                                agentIds.includes(member.uid)
                                  ? agentIds.filter((uid) => uid !== member.uid)
                                  : [...agentIds, member.uid],
                              )
                            }
                          />
                          {member.displayName || member.email}
                        </label>
                      ))}
                    </Inline>
                  </Stack>
                  <Stack gap="sm" className="vote-margin">
                    <Inline gap="md" wrap>
                      <Inline gap="sm">
                        <span className="vote-margin__icon" aria-hidden="true">
                          <i className="ph-duotone ph-chart-bar" />
                        </span>
                        <strong>Margen de error</strong>
                      </Inline>
                      <label>
                        <input
                          aria-label="No calcular margen de error"
                          type="radio"
                          checked={!margin.enabled}
                          onChange={() => setMargin(blankMargin())}
                        />{" "}
                        No calcular
                      </label>
                      <label>
                        <input
                          aria-label="Calcular margen de error"
                          type="radio"
                          checked={margin.enabled}
                          onChange={() =>
                            setMargin({ ...margin, enabled: true })
                          }
                        />{" "}
                        Calcular
                      </label>
                    </Inline>
                    {margin.enabled && (
                      <Stack gap="xs" className="vote-margin__grid">
                        <Stack gap="xs">
                          <label className="form-label mb-0">Población</label>
                          <input
                            aria-label="Población para margen de error"
                            type="number"
                            min="2"
                            className="form-control"
                            value={margin.populationSize}
                            onChange={(event) =>
                              setMargin({
                                ...margin,
                                populationSize:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              })
                            }
                            required
                          />
                        </Stack>
                        <Stack gap="xs">
                          <label className="form-label mb-0">Confianza</label>
                          <SelectControl
                            ariaLabel="Nivel de confianza"
                            label={`${margin.confidenceLevel}%`}
                            value={String(margin.confidenceLevel)}
                            onChange={(value) =>
                              setMargin({
                                ...margin,
                                confidenceLevel: Number(
                                  value,
                                ) as Margin["confidenceLevel"],
                              })
                            }
                            options={[80, 85, 90, 95, 99].map((value) => ({
                              value: String(value),
                              label: `${value}%`,
                            }))}
                          />
                        </Stack>
                        <Stack gap="xs">
                          <label className="form-label mb-0">
                            Muestra estimada
                          </label>
                          <input
                            aria-label="Muestra estimada para margen de error"
                            type="number"
                            min="1"
                            className="form-control"
                            value={margin.sampleSize}
                            onChange={(event) =>
                              setMargin({
                                ...margin,
                                sampleSize:
                                  event.target.value === ""
                                    ? ""
                                    : Number(event.target.value),
                              })
                            }
                            required
                          />
                        </Stack>
                        <Stack gap="xs" className="vote-margin__result">
                          <small>Margen calculado:</small>
                          <strong>{formatMargin(margin)}</strong>
                        </Stack>
                      </Stack>
                    )}
                  </Stack>
                </Stack>
              </Modal.Body>
              <Modal.Footer className="vote-stream-modal__footer">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => { setShow(false); reset(); setEditingStream(null); }}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <PrimaryButton type="submit" icon="plus" disabled={saving}>
                  {saving ? "Guardando…" : editingStream ? "Guardar cambios" : "Crear Stream"}
                </PrimaryButton>
              </Modal.Footer>
            </form>
          </Modal>
          {notice && (
            <Toast
              message={notice.message}
              variant={notice.variant}
              onClose={() => setNotice(null)}
            />
          )}
        </Stack>
      </PageContainer>
    </VoteStreamGate>
  );
}

function aggregate(
  stream: VoteStream,
  filter?: (submission: Submission) => boolean,
) {
  const totals: Record<string, number> = {};
  (stream.candidates ?? []).forEach((candidate) => {
    if (candidate.id) totals[candidate.id] = 0;
  });
  (stream.submissions ?? [])
    .filter((submission) => !filter || filter(submission))
    .forEach((submission) => {
      const entry = submission as Submission & {
        candidateId?: string;
        votes?: number;
        migratedToCandidateEntries?: boolean;
      };
      if (entry.candidateId)
        totals[entry.candidateId] =
          (totals[entry.candidateId] ?? 0) + (Number(entry.votes) || 0);
      else if (!entry.migratedToCandidateEntries)
        Object.entries(entry.votesByCandidate ?? {}).forEach(
          ([candidateId, votes]) => {
            totals[candidateId] =
              (totals[candidateId] ?? 0) + (Number(votes) || 0);
          },
        );
    });
  return totals;
}
function Breakdown({
  title,
  options,
  stream,
  keyName,
}: {
  title: string;
  options: Array<{ id: string; name: string }>;
  stream: VoteStream;
  keyName: "subLocationId" | "genderId" | "ageRangeId";
}) {
  if (!options.length) return null;
  return (
    <ContentPanel
      icon="pie-chart"
      title={title}
      subtitle="Distribución según los datos enviados."
    >
      <div className="vote-breakdowns">
        {options.map((option) => {
          const totals = aggregate(
            stream,
            (submission) => submission[keyName] === option.id,
          );
          const candidateIds = Object.keys(totals);
          const values = candidateIds.map((id) => totals[id]);
          const labels = candidateIds.map(
            (id) =>
              stream.candidates?.find((candidate) => candidate.id === id)
                ?.name ?? "Candidato",
          );
          const total = values.reduce((sum, value) => sum + value, 0);
          return (
            <article
              key={option.id}
              className="vote-breakdown"
              data-card="true"
            >
              <Stack gap="sm">
                <strong>{option.name}</strong>
                {total ? (
                  <ReactApexChart
                    type="donut"
                    height={210}
                    series={values}
                    options={{
                      labels,
                      legend: { position: "bottom" },
                      dataLabels: { enabled: false },
                      colors: [
                        "#0060F0",
                        "#D6008C",
                        "#10b981",
                        "#f59e0b",
                        "#7c4dff",
                        "#ef4444",
                      ],
                    }}
                  />
                ) : (
                  <EmptyState
                    icon="pie-chart"
                    title="Aún no hay datos cargados"
                    description="Los resultados aparecerán cuando los agentes envíen muestras."
                  />
                )}
              </Stack>
            </article>
          );
        })}
      </div>
    </ContentPanel>
  );
}
function useLiveVoteTotals(
  orgId?: string,
  campId?: string,
  voteStreamId?: string,
) {
  const [totals, setTotals] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!orgId || !campId || !voteStreamId) {
      setTotals(null);
      return;
    }
    return onSnapshot(
      doc(
        firestore,
        "organizations",
        orgId,
        "campaigns",
        campId,
        "voteStreams",
        voteStreamId,
      ),
      (snapshot) =>
        setTotals(
          (snapshot.data()?.liveResults?.totals as
            Record<string, number> | undefined) ?? null,
        ),
      () => setTotals(null),
    );
  }, [campId, orgId, voteStreamId]);
  return totals;
}

function useRankingReorderAnimation(
  containerRef: React.RefObject<HTMLDivElement>,
  rankingIds: string[],
) {
  const previousOrder = useRef<string[]>([]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cards = Array.from(
      container.querySelectorAll<HTMLElement>("[data-vote-ranking-id]"),
    );
    const slots = cards.map((card) => card.getBoundingClientRect().top);
    const animations: Animation[] = [];
    cards.forEach((card, index) => {
      const id = card.dataset.voteRankingId;
      if (!id) return;
      const previousIndex = previousOrder.current.indexOf(id);
      const moved = previousIndex >= 0 && previousIndex !== index;
      if (!moved || slots[previousIndex] === undefined || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      // Use positions in the current layout so entering fullscreen or scrolling
      // cannot introduce a stale viewport offset into the animation.
      const deltaY = slots[previousIndex] - slots[index];
      animations.push(
        card.animate(
          [{ transform: `translateY(${deltaY}px)` }, { transform: 'translateY(0)' }],
          { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
        ),
      );
    });
    previousOrder.current = cards
      .map((card) => card.dataset.voteRankingId)
      .filter((id): id is string => Boolean(id));
    return () => animations.forEach((animation) => animation.cancel());
  }, [containerRef, rankingIds.join("|")]);
}

function AdminRanking({
  stream,
  ranked,
  totals,
  scrutinized,
  maxVotes,
  margin,
  irreversible,
  canManage,
  onEditPhoto,
}: {
  stream: VoteStream;
  ranked: Candidate[];
  totals: Record<string, number>;
  scrutinized: number;
  maxVotes: number;
  margin: number | null;
  irreversible: boolean;
  canManage: boolean;
  onEditPhoto: (candidate: Candidate) => void;
}) {
  const rankingRef = useRef<HTMLDivElement>(null);
  const [fullScreen, setFullScreen] = useState(false);
  useRankingReorderAnimation(
    rankingRef,
    ranked.map((candidate) => candidate.id ?? candidate.name),
  );
  useEffect(() => {
    const onFullscreenChange = () =>
      setFullScreen(document.fullscreenElement === rankingRef.current);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === rankingRef.current) {
      await document.exitFullscreen?.();
      return;
    }
    await rankingRef.current?.requestFullscreen?.();
  };

  return (
    <div ref={rankingRef} className="vote-ranking-board" data-vote-ranking-board>
      <ContentPanel
        icon="bar-chart-2"
        title="Ranking de candidatos"
        subtitle="Los resultados se actualizan con cada envío recibido."
        headerAction={
          <Inline gap="sm" className="vote-ranking-board__actions">
            <span className={`vote-status is-${stream.status}`}>{stream.status}</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary vote-ranking-board__fullscreen"
              aria-label={fullScreen ? "Salir de pantalla completa" : "Abrir ranking en pantalla completa"}
              title={fullScreen ? "Salir de pantalla completa" : "Abrir ranking en pantalla completa"}
              onClick={() => void toggleFullscreen()}
            >
              <i className={`ph-duotone ${fullScreen ? "ph-corners-in" : "ph-corners-out"}`} aria-hidden="true" />
            </button>
          </Inline>
        }
      >
        <Stack gap="md">
          {ranked.length ? (
            ranked.map((candidate, index) => {
              const votes = totals[candidate.id ?? ""] ?? 0;
              const percentage = scrutinized ? Math.round((votes / scrutinized) * 100) : 0;
              return (
                <article
                  className="vote-ranking"
                  data-card="true"
                  data-vote-ranking-id={candidate.id}
                  key={candidate.id}
                >
                  <Inline gap="md" className="align-items-center">
                    <span className="vote-ranking__position">#{index + 1}</span>
                    <CandidateAvatar candidate={candidate} size="large" />
                    <Stack gap="xs" className="vote-ranking__copy">
                      <Inline gap="xs" wrap>
                        <strong>{candidate.name}</strong>
                        {index === 0 && irreversible && <span className="badge text-bg-success">🏆 Ganador proyectado (irreversible)</span>}
                        {stream.winnerCandidateId === candidate.id && <span className="badge text-bg-primary">Ganador al cierre</span>}
                      </Inline>
                      <small>
                        {candidate.party || "Sin partido informado"} · {votes} votos
                        {margin !== null
                          ? ` · rango ${Math.max(0, percentage - margin)}%-${Math.min(100, percentage + margin)}%`
                          : ""}
                      </small>
                      <div className="vote-ranking__bar"><span style={{ width: `${(votes / maxVotes) * 100}%` }} /></div>
                    </Stack>
                    <Stack gap="xs" className="vote-ranking__end">
                      <strong className="vote-ranking__percentage">{percentage}%</strong>
                      {canManage && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          aria-label={`Editar foto de ${candidate.name}`}
                          onClick={() => onEditPhoto(candidate)}
                        >
                          Foto
                        </button>
                      )}
                    </Stack>
                  </Inline>
                </article>
              );
            })
          ) : (
            <EmptyState icon="bar-chart-2" title="Aún no hay datos cargados" description="El ranking aparecerá cuando los agentes de sondeo envíen resultados." />
          )}
        </Stack>
      </ContentPanel>
    </div>
  );
}

function AgentTracking({
  user,
  base,
  streamId,
  candidates,
  onCorrected,
  refreshKey,
}: {
  user: ReturnType<typeof useAuth>["user"];
  base: string;
  streamId: string;
  candidates: Candidate[];
  onCorrected: () => Promise<void>;
  refreshKey: number;
}) {
  const [agents, setAgents] = useState<
    Array<{
      uid: string;
      name: string;
      submittedToday: boolean;
      latestBatchId: string | null;
    }>
  >([]);
  const [batch, setBatch] = useState<
    Array<{ id: string; candidateId: string; votes: number }>
  >([]);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [draftVotes, setDraftVotes] = useState("");
  const [savingSubmissionId, setSavingSubmissionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!user) return;
    void authenticatedFetch<
      Array<{
        uid: string;
        name: string;
        submittedToday: boolean;
        latestBatchId: string | null;
      }>
    >(user, `${base}/${streamId}/agents-status`)
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [user, base, streamId, refreshKey]);
  const openBatch = async (batchId: string) => {
    if (!user) return;
    setError("");
    setEditingSubmissionId(null);
    try {
      setBatch(
        await authenticatedFetch(
        user,
        `${base}/${streamId}/submissions/by-batch/${encodeURIComponent(batchId)}`,
        ),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos abrir el envío.");
    }
  };
  const saveCorrection = async (entry: { id: string; candidateId: string; votes: number }) => {
    if (!user) return;
    const votes = Number(draftVotes);
    if (!Number.isInteger(votes) || votes < 0) {
      setError("Indicá una cantidad entera de votos válida.");
      return;
    }
    setSavingSubmissionId(entry.id);
    setError("");
    try {
      const updated = await authenticatedFetch<{ id: string; votes: number }>(
        user,
        `${base}/${streamId}/submissions/${entry.id}`,
        { method: "PUT", body: JSON.stringify({ votes }) },
      );
      setBatch((current) => current.map((item) => (item.id === entry.id ? { ...item, votes: updated.votes } : item)));
      setEditingSubmissionId(null);
      await onCorrected();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos corregir el envío.");
    } finally {
      setSavingSubmissionId(null);
    }
  };
  return (
    <ContentPanel
      icon="users"
      title="Seguimiento de agentes"
      subtitle="Estado de envío de la jornada actual."
    >
      <Stack gap="sm">
        {agents.map((agent) => (
          <Inline
            key={agent.uid}
            gap="sm"
            className="justify-content-between align-items-center"
          >
            <span>{agent.name}</span>
            <Inline gap="sm">
              {agent.submittedToday ? (
                <span className="badge text-bg-success">Enviado</span>
              ) : (
                <span className="badge text-bg-secondary">Pendiente</span>
              )}
              {agent.latestBatchId && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => void openBatch(agent.latestBatchId!)}
                >
                  Ver envío
                </button>
              )}
            </Inline>
          </Inline>
        ))}
        {agents.length > 0 && agents.every((agent) => agent.submittedToday) && (
          <span className="text-success">
            Todos los agentes enviaron resultados.
          </span>
        )}
        {batch.length > 0 && (
          <Stack gap="sm" className="vote-agent-batch">
            <strong>Detalle del envío</strong>
            {batch.map((entry) => {
              const candidate = candidates.find((item) => item.id === entry.candidateId);
              const isEditing = editingSubmissionId === entry.id;
              return (
                <Inline key={entry.id} gap="sm" wrap className="vote-agent-batch__entry">
                  <span>{candidate?.name ?? entry.candidateId}</span>
                  {isEditing ? (
                    <>
                      <input
                        aria-label={`Votos corregidos para ${candidate?.name ?? entry.candidateId}`}
                        type="number"
                        min="0"
                        className="form-control form-control-sm vote-agent-batch__votes"
                        value={draftVotes}
                        onChange={(event) => setDraftVotes(event.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={savingSubmissionId === entry.id}
                        onClick={() => void saveCorrection(entry)}
                      >
                        {savingSubmissionId === entry.id ? "Guardando…" : "Guardar corrección"}
                      </button>
                      <button type="button" className="btn btn-sm btn-light" disabled={savingSubmissionId === entry.id} onClick={() => setEditingSubmissionId(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <strong>{entry.votes} votos</strong>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        aria-label={`Editar envío de ${candidate?.name ?? entry.candidateId}`}
                        onClick={() => {
                          setDraftVotes(String(entry.votes));
                          setEditingSubmissionId(entry.id);
                        }}
                      >
                        Editar
                      </button>
                    </>
                  )}
                </Inline>
              );
            })}
          </Stack>
        )}
        {error && <span className="text-danger small">{error}</span>}
      </Stack>
    </ContentPanel>
  );
}
export function VoteStreamDetail() {
  const { voteStreamId = "" } = useParams();
  const { user } = useAuth();
  const { campaign } = useCampaign();
  const { enabledAddons, role } = useActiveCampaign();
  const navigate = useNavigate();
  const base = campaign
    ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/vote-streams`
    : null;
  const query = useAuthenticatedQuery<VoteStream>(
    user,
    enabledAddons.voteStream && base && voteStreamId
      ? `${base}/${voteStreamId}`
      : null,
    [base, enabledAddons.voteStream, voteStreamId],
  );
  const liveTotals = useLiveVoteTotals(
    campaign?.orgId,
    campaign?.campId,
    voteStreamId,
  );
  const [total, setTotal] = useState<number | "">("");
  const [notice, setNotice] = useState<{
    message: string;
    variant: "success" | "danger";
  } | null>(null);
  const [closing, setClosing] = useState(false);
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<{ name: string; votes: number; percentage: number } | null>(null);
  const [photoCandidate, setPhotoCandidate] = useState<Candidate | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const stream = query.data;
  const canManage = ["cliente", "admin"].includes(role);
  useEffect(() => {
    if (!stream || stream.status !== "activa") return;
    const timer = window.setInterval(() => {
      void query.reload();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [query.reload, stream?.id, stream?.status]);
  const totals = useMemo(
    () => liveTotals ?? (stream ? aggregate(stream) : {}),
    [liveTotals, stream],
  );
  const ranked = stream
    ? [...(stream.candidates ?? [])].sort(
        (left, right) =>
          (totals[right.id ?? ""] ?? 0) - (totals[left.id ?? ""] ?? 0),
      )
    : [];
  const scrutinized = Object.values(totals).reduce(
    (sum, value) => sum + value,
    0,
  );
  const missing =
    stream?.totalElectorsOrEstimatedVotes == null
      ? null
      : Math.max(0, stream.totalElectorsOrEstimatedVotes - scrutinized);
  const irreversible =
    ranked.length > 1 &&
    missing !== null &&
    (totals[ranked[0].id ?? ""] ?? 0) - (totals[ranked[1].id ?? ""] ?? 0) >
      missing;
  const maxVotes = Math.max(1, ...Object.values(totals));
  const saveTotal = async () => {
    if (!user || !base || !stream) return;
    try {
      await authenticatedFetch(user, `${base}/${stream.id}`, {
        method: "PUT",
        body: JSON.stringify({
          totalElectorsOrEstimatedVotes: total === "" ? null : total,
        }),
      });
      await query.reload();
      setNotice({ message: "Total estimado actualizado.", variant: "success" });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "No pudimos guardar el total.",
        variant: "danger",
      });
    }
  };
  const action = async (path: "activate" | "close") => {
    if (!user || !base || !stream) return;
    if (
      path === "close" &&
      !window.confirm("¿Cerrar la Vote Stream y calcular el ganador?")
    )
      return;
    setClosing(true);
    try {
      const updated = await authenticatedFetch<VoteStream>(user, `${base}/${stream.id}/${path}`, {
        method: "POST",
      });
      await query.reload();
      if (path === "close") {
        const winner = updated.candidates?.find((candidate) => candidate.id === updated.winnerCandidateId);
        const updatedTotals = updated.liveResults?.totals ?? {};
        const updatedVotes = Object.values(updatedTotals).reduce((sum, value) => sum + Number(value), 0);
        setWinnerAnnouncement({ name: winner?.name ?? "Sin vencedor", votes: Number(updatedTotals[updated.winnerCandidateId ?? ""] ?? 0), percentage: updatedVotes ? Math.round(Number(updatedTotals[updated.winnerCandidateId ?? ""] ?? 0) / updatedVotes * 100) : 0 });
      }
      setNotice({
        message:
          path === "activate"
            ? "Vote Stream activada."
            : "Vote Stream cerrada y ganador guardado.",
        variant: "success",
      });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error
            ? error.message
            : "No pudimos actualizar el estado.",
        variant: "danger",
      });
    } finally {
      setClosing(false);
    }
  };
  const remove = async () => {
    if (
      !user ||
      !base ||
      !stream ||
      !window.confirm(`¿Eliminar “${stream.name}”?`)
    )
      return;
    await authenticatedFetch(user, `${base}/${stream.id}`, {
      method: "DELETE",
    });
    navigate("/vote-stream");
  };
  const uploadCandidatePhoto = async (photo: Blob) => {
    if (!user || !base || !stream || !photoCandidate?.id) return;
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append("photo", photo, "candidate.jpg");
      await authenticatedFetch(
        user,
        `${base}/${stream.id}/candidates/${photoCandidate.id}/assets`,
        { method: "POST", body },
      );
      await query.reload();
      setPhotoCandidate(null);
      setNotice({ message: "Foto recortada subida correctamente.", variant: "success" });
    } finally {
      setUploadingPhoto(false);
    }
  };
  if (!enabledAddons.voteStream)
    return (
      <VoteStreamGate>
        <></>
      </VoteStreamGate>
    );
  if (query.loading && !stream)
    return <PageContainer aria-busy="true" aria-label="Vote Stream" />;
  if (!stream)
    return (
      <PageContainer>
        <EmptyState
          icon="target"
          title="No encontramos la Vote Stream"
          description={query.error?.message ?? "Puede haber sido eliminada."}
          ctaLabel="Volver"
          onCtaClick={() => navigate("/vote-stream")}
        />
      </PageContainer>
    );
  const margin =
    stream.marginOfError?.enabled &&
    typeof stream.marginOfError.computedMargin === "number"
      ? stream.marginOfError.computedMargin
      : null;
  return (
    <PageContainer backTo="/vote-stream" backLabel="Volver a Vote Stream">
      <Stack gap="lg" className="gap-0">
        <HeroBanner
          icon="bar-chart-2"
          eyebrow="RESULTADOS ELECTORALES"
          title={stream.name}
          subtitle={`${stream.location} · ${stream.date} · ${formatSystem(stream.electoralSystem)}`}
          backTo="/vote-stream"
          backLabel="Volver a Vote Stream"
          ctaLabel={stream.status === "pendiente" && canManage ? "Activar" : stream.status === "activa" && canManage ? "Data Entry" : undefined}
          onCtaClick={() => stream.status === "pendiente" ? void action("activate") : navigate(`/vote-stream/${stream.id}/data-entry`)}
          secondaryCtaLabel={
            stream.status === "activa" && canManage ? "Finalizar elección" : undefined
          }
          onSecondaryCtaClick={() => void action("close")}
          ctaDisabled={closing}
          secondaryCtaDisabled={closing}
          tags={[
            { icon: "bar-chart-2", label: `${scrutinized} votos` },
            {
              icon: "users",
              label: `${stream.submissions?.length ?? 0} envíos`,
            },
          ]}
        />
        <div className="cd-dashboard__kpis">
          <KpiCard
            icon="trend"
            value={scrutinized}
            label="Votos escrutados"
            caption="Datos enviados por agentes"
          />
          <KpiCard
            icon="people"
            value={stream.totalElectorsOrEstimatedVotes ?? "—"}
            label="Total estimado"
            caption={
              missing === null
                ? "Aún no informado"
                : `${missing} votos restantes`
            }
          />
          <KpiCard
            icon="target"
            value={ranked[0]?.name ?? "—"}
            label="Primer lugar"
            caption={
              irreversible ? "Ganador proyectado" : "Resultado provisorio"
            }
          />
        </div>
        <AdminRanking
          stream={stream}
          ranked={ranked}
          totals={totals}
          scrutinized={scrutinized}
          maxVotes={maxVotes}
          margin={margin}
          irreversible={irreversible}
          canManage={canManage}
          onEditPhoto={setPhotoCandidate}
        />
        <ContentPanel
          icon="people"
          title="Total de electores/votos estimados"
          subtitle="Se usa para estimar votos faltantes y confirmar un ganador irreversible."
        >
          <Inline gap="md" wrap>
            <input
              aria-label="Total de electores o votos estimados"
              type="number"
              min="0"
              className="form-control vote-total-input"
              placeholder="Ej. 2500"
              value={
                total === ""
                  ? (stream.totalElectorsOrEstimatedVotes ?? "")
                  : total
              }
              onChange={(event) =>
                setTotal(
                  event.target.value === "" ? "" : Number(event.target.value),
                )
              }
              disabled={!canManage}
            />
            <PrimaryButton
              icon="check"
              onClick={() => void saveTotal()}
              disabled={!canManage}
            >
              Guardar total
            </PrimaryButton>
          </Inline>
        </ContentPanel>
        <Breakdown
          title="Sub ubicaciones"
          options={stream.subLocations ?? []}
          stream={stream}
          keyName="subLocationId"
        />
        <Breakdown
          title="Demográficos"
          options={stream.genderOptions ?? []}
          stream={stream}
          keyName="genderId"
        />
        <Breakdown
          title="Rangos de edad"
          options={stream.ageRanges ?? []}
          stream={stream}
          keyName="ageRangeId"
        />
        {canManage && <section id="seguimiento-agentes"><AgentTracking user={user} base={base!} streamId={stream.id} candidates={stream.candidates ?? []} onCorrected={query.reload} refreshKey={scrutinized} /></section>}
        <ContentPanel
          icon="award"
          title="Nota sobre resultados"
          subtitle="La exactitud depende de la calidad, tamaño y representatividad de los datos enviados por los agentes."
        >
          <Inline gap="md" wrap>
            <Link className="btn btn-outline-primary" to="/vote-stream">
              Volver a inicio
            </Link>
            {canManage && (
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => {
                  if (!user || !base) return;
                  void authenticatedFetch<{ url: string }>(
                    user,
                    `${base}/${stream.id}/publish-ranking`,
                    { method: "POST" },
                  )
                    .then((result) => {
                      void navigator.clipboard?.writeText(
                        `${window.location.origin}${result.url}`,
                      );
                      setNotice({
                        message:
                          "Enlace público copiado. Solo muestra el ranking agregado.",
                        variant: "success",
                      });
                    })
                    .catch((error) =>
                      setNotice({ message: error.message, variant: "danger" }),
                    );
                }}
              >
                Publicar ranking
              </button>
            )}
            {canManage && (
              <button
                type="button"
                className="btn btn-outline-danger"
                onClick={() => void remove()}
              >
                Eliminar Vote Stream
              </button>
            )}
          </Inline>
        </ContentPanel>
        {notice && (
          <Toast
            message={notice.message}
            variant={notice.variant}
            onClose={() => setNotice(null)}
          />
        )}
        <Modal show={Boolean(winnerAnnouncement)} centered onHide={() => setWinnerAnnouncement(null)}>
          <Modal.Header closeButton><Modal.Title>🏆 Elección finalizada</Modal.Title></Modal.Header>
          <Modal.Body><Stack gap="sm"><strong className="vote-winner-announcement__name">{winnerAnnouncement?.name}</strong><span>es el vencedor con {winnerAnnouncement?.percentage ?? 0}% de los votos.</span><small>{winnerAnnouncement?.votes ?? 0} votos registrados al cierre.</small></Stack></Modal.Body>
          <Modal.Footer><PrimaryButton icon="check" onClick={() => setWinnerAnnouncement(null)}>Ver resultados</PrimaryButton></Modal.Footer>
        </Modal>
        <CandidatePhotoCropModal
          candidate={photoCandidate}
          saving={uploadingPhoto}
          onClose={() => setPhotoCandidate(null)}
          onSave={uploadCandidatePhoto}
        />
      </Stack>
    </PageContainer>
  );
}
