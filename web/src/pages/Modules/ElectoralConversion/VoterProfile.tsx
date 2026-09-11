import { FormEvent, useState } from "react";
import { Button } from "react-bootstrap";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authenticatedFetch, useAuthenticatedQuery } from "../../../lib/api";
import { useCampaign } from "../Organization/useCampaign";
import HeroBanner from "../../../components/Shared/HeroBanner";
import Card from "../../../components/Shared/Card";
import EmptyState from "../../../components/Shared/EmptyState";
import Inline from "../../../components/Shared/Inline";
import PageContainer from "../../../components/Shared/PageContainer";
import Stack from "../../../components/Shared/Stack";
import Timeline, { TimelineEvent } from "../../../components/Planning/Timeline";

type Voter = {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  state?: string;
  barrio?: string;
  dni?: string;
  sexo?: string;
  fechaNacimiento?: string;
  edadAproximada?: number;
  issueDetails?: Array<{ id: string; name: string }>;
};
type Profile = {
  voter: Voter;
  household: Array<{ id: string; name: string }>;
  notes: Array<{ id: string; text: string; createdAt: string; author: string }>;
  timeline: TimelineEvent[];
};
const states: Record<string, string> = {
  unvisited: "Listo para visitar",
  visited: "Visitado",
  converted_yes: "Favorable",
  converted_no: "No favorable",
  undecided: "Indeciso",
};
const age = (birth?: string, approximate?: number) => {
  if (birth) {
    const date = new Date(`${birth}T00:00:00`);
    const today = new Date();
    return (
      today.getFullYear() -
      date.getFullYear() -
      Number(
        today < new Date(today.getFullYear(), date.getMonth(), date.getDate()),
      )
    );
  }
  return approximate ?? null;
};

export default function VoterProfile() {
  const { voterId = "" } = useParams();
  const navigate = useNavigate();
  const { user, campaign } = useCampaign();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const path =
    campaign && voterId
      ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters/${voterId}/profile`
      : null;
  const profile = useAuthenticatedQuery<Profile>(user, path, [path]);
  const data = profile.data;
  const addNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !campaign || !voterId || !note.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await authenticatedFetch(
        user,
        `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/voters/${voterId}/notes`,
        { method: "POST", body: JSON.stringify({ text: note }) },
      );
      setNote("");
      await profile.reload();
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "No pudimos guardar la nota.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (profile.loading)
    return (
      <PageContainer>
        <EmptyState
          icon="users"
          title="Cargando perfil del elector"
          description="Estamos reuniendo su historial y datos de contacto."
        />
      </PageContainer>
    );
  if (profile.error || !data)
    return (
      <PageContainer>
        <EmptyState
          icon="users"
          title="No pudimos cargar el perfil"
          description={
            profile.error?.message ?? "El elector no existe o ya fue eliminado."
          }
          ctaLabel="Volver a electores"
          onCtaClick={() => navigate("/electoral-conversion/voters")}
        />
      </PageContainer>
    );
  const voter = data.voter;
  const currentAge = age(voter.fechaNacimiento, voter.edadAproximada);
  return (
    <PageContainer>
      <Stack gap="lg">
        <HeroBanner
          icon="users"
          title={voter.name}
          subtitle={voter.address || "Sin dirección cargada"}
          subtitleDetail="Perfil 360° del elector: datos, hogar, conversaciones y notas."
          ctaLabel="Visitar"
          ctaIcon="plus"
          onCtaClick={() => navigate(`/visit/${voter.id}`)}
          secondaryCtaLabel="Editar datos"
          secondaryCtaIcon="bars"
          onSecondaryCtaClick={() =>
            navigate(`/electoral-conversion/voters?edit=${voter.id}`)
          }
        />
        <div className="cs-voter-profile-grid">
          <Card
            icon="people"
            title="Datos del elector"
            subtitle="Información de contacto y segmentación."
          >
            <Stack gap="sm">
              <Inline gap="sm" wrap>
                {(voter.tags ?? []).length ? (
                  voter.tags!.map((tag) => (
                    <span className="cd-voter-tag" key={tag}>
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-muted">Sin tags</span>
                )}
                <span className="cd-state-pill">
                  {states[voter.state ?? ""] ?? "Sin estado"}
                </span>
              </Inline>
              {voter.issueDetails?.length ? (
                <Inline gap="xs" wrap>
                  {voter.issueDetails.map((issue) => (
                    <span className="cd-voter-tag" key={issue.id}>
                      Tema: {issue.name}
                    </span>
                  ))}
                </Inline>
              ) : null}
              <dl className="cs-voter-profile__details">
                <dt>Teléfono</dt>
                <dd>{voter.phone || "—"}</dd>
                <dt>Email</dt>
                <dd>{voter.email || "—"}</dd>
                <dt>Barrio</dt>
                <dd>{voter.barrio || "—"}</dd>
                <dt>DNI</dt>
                <dd>{voter.dni || "—"}</dd>
                <dt>Sexo</dt>
                <dd>{voter.sexo || "—"}</dd>
                <dt>Edad</dt>
                <dd>{currentAge ?? "—"}</dd>
              </dl>
            </Stack>
          </Card>
          <Card
            icon="people"
            title="Hogar"
            subtitle={
              data.household.length
                ? "Personas asociadas a la misma dirección."
                : "No hay otros integrantes asociados."
            }
          >
            <Stack gap="sm">
              {data.household.length ? (
                data.household.map((member) => (
                  <Link
                    className="cs-voter-profile__household-link"
                    key={member.id}
                    to={`/electoral-conversion/electores/${member.id}`}
                  >
                    {member.name}
                  </Link>
                ))
              ) : (
                <span className="text-muted">
                  Este elector todavía no comparte un hogar registrado.
                </span>
              )}
            </Stack>
          </Card>
        </div>
        <Card
          icon="pulse"
          title="Historial de actividad"
          subtitle="Visitas, cambios de tags y notas, desde lo más reciente."
        >
          <Timeline
            events={data.timeline.map((event) => ({ ...event, type: "event" }))}
          />
        </Card>
        <Card
          icon="doc"
          title="Notas"
          subtitle="Observaciones acumulativas del equipo."
        >
          <Stack gap="md">
            <form onSubmit={addNote}>
              <Stack gap="sm">
                <textarea
                  aria-label="Nueva nota"
                  className="form-control"
                  rows={4}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Agregá una nota sobre este elector…"
                />
                <Inline gap="sm">
                  <Button type="submit" disabled={saving || !note.trim()}>
                    {saving ? "Guardando…" : "Guardar nota"}
                  </Button>
                </Inline>
              </Stack>
            </form>
            {message && (
              <div className="alert alert-danger mb-0" role="alert">
                {message}
              </div>
            )}
            {data.notes.length ? (
              <Stack gap="sm">
                {data.notes.map((item) => (
                  <article className="cs-voter-note" key={item.id}>
                    <Stack gap="xs">
                      <strong>{item.author}</strong>
                      <span>{item.text}</span>
                      <small>
                        {new Date(item.createdAt).toLocaleString("es-AR")}
                      </small>
                    </Stack>
                  </article>
                ))}
              </Stack>
            ) : (
              <span className="text-muted">
                Todavía no hay notas registradas.
              </span>
            )}
          </Stack>
        </Card>
      </Stack>
    </PageContainer>
  );
}
