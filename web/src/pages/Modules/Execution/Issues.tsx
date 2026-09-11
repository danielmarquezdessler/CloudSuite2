import { FormEvent, useMemo, useState } from "react";
import Chart from "react-apexcharts";
import { Button, Modal } from "react-bootstrap";
import { authenticatedFetch, useAuthenticatedQuery } from "../../../lib/api";
import { useCampaign } from "../Organization/useCampaign";
import HeroBanner from "../../../components/Shared/HeroBanner";
import ContentPanel from "../../../components/Shared/ContentPanel";
import EmptyState from "../../../components/Shared/EmptyState";
import Inline from "../../../components/Shared/Inline";
import PageContainer from "../../../components/Shared/PageContainer";
import Stack from "../../../components/Shared/Stack";

type Issue = { id: string; name: string };
type Summary = { issueId: string; name: string; count: number };

export default function Issues() {
  const { user, campaign } = useCampaign();
  const base = campaign
    ? `/api/organizations/${campaign.orgId}/campaigns/${campaign.campId}/issues`
    : null;
  const types = useAuthenticatedQuery<Issue[]>(
    user,
    base ? `${base}/types` : null,
    [base],
  );
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const summary = useAuthenticatedQuery<Summary[]>(
    user,
    base ? `${base}/summary?start=${start}&end=${end}` : null,
    [base, start, end],
  );
  const [editor, setEditor] = useState<Issue | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const series = useMemo(
    () => [
      {
        name: "Menciones",
        data: (summary.data ?? []).map((item) => item.count),
      },
    ],
    [summary.data],
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !base || !name.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      await authenticatedFetch(
        user,
        editor ? `${base}/types/${editor.id}` : `${base}/types`,
        {
          method: editor ? "PUT" : "POST",
          body: JSON.stringify({ name: name.trim() }),
        },
      );
      setEditor(undefined);
      await Promise.all([types.reload(), summary.reload()]);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "No pudimos guardar el tema.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item: Issue) => {
    if (
      !user ||
      !base ||
      !window.confirm(
        `¿Eliminar el tema “${item.name}”? Las menciones históricas no se borrarán.`,
      )
    )
      return;
    try {
      await authenticatedFetch(user, `${base}/types/${item.id}`, {
        method: "DELETE",
      });
      await Promise.all([types.reload(), summary.reload()]);
    } catch (caught) {
      setMessage(
        caught instanceof Error
          ? caught.message
          : "No pudimos eliminar el tema.",
      );
    }
  };
  return (
    <PageContainer>
      <Stack gap="lg">
        <HeroBanner
          icon="pulse"
          title="Temas más mencionados"
          subtitle="Priorizá las preocupaciones que aparecen en las conversaciones."
          ctaLabel="Administrar temas"
          ctaIcon="gear"
          onCtaClick={() => {
            setName("");
            setEditor(null);
          }}
        />
        <ContentPanel
          icon="trend"
          title="Ranking de menciones"
          subtitle="Información operativa basada en visitas reales."
          headerAction={
            <Inline gap="sm">
              <label className="visually-hidden" htmlFor="issues-start">
                Desde
              </label>
              <input
                id="issues-start"
                className="form-control"
                type="date"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
              <label className="visually-hidden" htmlFor="issues-end">
                Hasta
              </label>
              <input
                id="issues-end"
                className="form-control"
                type="date"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Inline>
          }
        >
          {summary.loading ? (
            <EmptyState
              icon="pulse"
              title="Cargando temas"
              description="Estamos contando las menciones de las visitas."
            />
          ) : summary.error ? (
            <EmptyState
              icon="pulse"
              title="No pudimos cargar los temas"
              description={summary.error.message}
            />
          ) : summary.data?.length ? (
            <Chart
              type="bar"
              height={320}
              series={series}
              options={{
                chart: { toolbar: { show: false } },
                colors: ["#0060F0"],
                plotOptions: { bar: { borderRadius: 6, horizontal: true } },
                dataLabels: { enabled: true },
                xaxis: { categories: summary.data.map((item) => item.name) },
                grid: { borderColor: "#e5edf9" },
              }}
            />
          ) : (
            <EmptyState
              icon="pulse"
              title="Aún no hay temas mencionados"
              description="Marcá temas al registrar una visita para ver el ranking."
            />
          )}
        </ContentPanel>
        <ContentPanel
          icon="list"
          title="Catálogo de temas"
          subtitle="Elegí los temas disponibles para registrar durante una visita."
          headerAction={
            <Button
              onClick={() => {
                setName("");
                setEditor(null);
              }}
            >
              Agregar tema
            </Button>
          }
        >
          <Stack gap="sm">
            {message && (
              <div className="alert alert-danger mb-0" role="alert">
                {message}
              </div>
            )}
            {types.loading ? (
              <span>Cargando catálogo…</span>
            ) : types.error ? (
              <span className="text-danger">{types.error.message}</span>
            ) : types.data?.length ? (
              types.data?.map((item) => (
                <article className="cs-issue-type" key={item.id}>
                  <Inline gap="sm" wrap>
                    <strong>{item.name}</strong>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      onClick={() => {
                        setName(item.name);
                        setEditor(item);
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => remove(item)}
                    >
                      Eliminar
                    </Button>
                  </Inline>
                </article>
              ))
            ) : (
              <span className="text-muted">Todavía no hay temas en el catálogo.</span>
            )}
          </Stack>
        </ContentPanel>
        <Modal
          show={editor !== undefined}
          onHide={() => setEditor(undefined)}
          centered
        >
          <form onSubmit={save}>
            <Modal.Header closeButton>
              <Modal.Title>{editor ? "Editar tema" : "Nuevo tema"}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Stack gap="sm">
                <label htmlFor="issue-name">Nombre del tema</label>
                <input
                  id="issue-name"
                  className="form-control"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  autoFocus
                />
              </Stack>
            </Modal.Body>
            <Modal.Footer>
              <Inline gap="sm">
                <Button
                  variant="outline-secondary"
                  type="button"
                  onClick={() => setEditor(undefined)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Guardando…" : "Guardar tema"}
                </Button>
              </Inline>
            </Modal.Footer>
          </form>
        </Modal>
      </Stack>
    </PageContainer>
  );
}
