import { ChangeEvent, useEffect, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Button, Modal } from 'react-bootstrap';
import SelectControl from '../Shared/SelectControl';

type Item = { id: string; name: string };
type EditableUser = { uid: string; firstName?: string; lastName?: string; displayName?: string; phone?: string; email: string; campaignId?: string; functionId?: string; teamId?: string };
type Props = { show: boolean; functions: Item[]; teams: Item[]; campaigns: Item[]; onHide: () => void; onSubmit: (data: FormData) => Promise<void>; mode?: 'create' | 'edit'; initialUser?: EditableUser | null };
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
const AVATAR_DISPLAY_SIZE = 512;

async function cropImage(source: string, area: Area) {
  const image = new Image();
  image.src = source;
  await new Promise<void>((resolveLoad, reject) => { image.onload = () => resolveLoad(); image.onerror = () => reject(new Error('No pudimos leer la imagen.')); });
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, AVATAR_DISPLAY_SIZE / Math.max(area.width, area.height));
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  canvas.getContext('2d')!.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolveBlob, reject) => canvas.toBlob((blob) => blob ? resolveBlob(blob) : reject(new Error('No pudimos recortar la imagen.')), 'image/jpeg', .82));
}

export default function CreateUserModal({ show, functions, teams, campaigns, onHide, onSubmit, mode = 'create', initialUser = null }: Props) {
  const [values, setValues] = useState({ firstName:'', lastName:'', phone:'', email:'', password:'', functionId:'', teamId:'', campaignId:'' });
  const [source, setSource] = useState('');
  const [crop, setCrop] = useState({ x:0, y:0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [avatar, setAvatar] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEditing = mode === 'edit';
  useEffect(() => {
    if (!show) return;
    const nameParts = initialUser?.displayName?.trim().split(/\s+/) ?? [];
    setValues({
      firstName: initialUser?.firstName ?? nameParts[0] ?? '',
      lastName: initialUser?.lastName ?? nameParts.slice(1).join(' ') ?? '',
      phone: initialUser?.phone ?? '',
      email: initialUser?.email ?? '',
      password: '', functionId: initialUser?.functionId ?? '', teamId: initialUser?.teamId ?? '', campaignId: initialUser?.campaignId ?? ''
    });
    setSource(''); setAvatar(null); setError('');
  }, [show, initialUser, mode]);
  const update = (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]:event.target.value });
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('La foto de perfil debe ser una imagen.'); return; }
    if (file.size > MAX_AVATAR_BYTES) { setError('La imagen no puede superar los 8 MB.'); event.target.value = ''; return; }
    setError('');
    setAvatar(null);
    setSource(URL.createObjectURL(file));
  };
  const confirmCrop = () => {
    if (!source || !area) return;
    void cropImage(source, area).then((blob) => {
      if (blob.size > MAX_AVATAR_BYTES) throw new Error('La imagen recortada no puede superar los 8 MB. Elegí una foto más liviana.');
      setAvatar(blob);
      setError('');
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'No pudimos recortar la imagen.'));
  };
  const selectCampaign = (campaignId: string) => setValues({ ...values, campaignId, functionId:'', teamId:'' });
  const submit = async () => {
    setError('');
    if (!values.firstName || !values.lastName || !values.email || (!isEditing && !values.password)) { setError(isEditing ? 'Completá nombre, apellido y email.' : 'Completá nombre, apellido, email y contraseña.'); return; }
    if (source && !avatar) { setError('Confirmá el recorte de la foto antes de guardar el usuario.'); return; }
    if (avatar && avatar.size > MAX_AVATAR_BYTES) { setError('La imagen no puede superar los 8 MB.'); return; }
    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(values).forEach(([key, value]) => data.append(key, value));
      if (avatar) data.append('avatar', avatar, 'avatar.jpg');
      await onSubmit(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `No pudimos ${isEditing ? 'actualizar' : 'crear'} el usuario.`);
    } finally { setSaving(false); }
  };

  return <Modal size="lg" show={show} onHide={() => !saving && onHide()}>
    <Modal.Header closeButton><Modal.Title>{isEditing ? 'Editar usuario' : 'Crear usuario'}</Modal.Title></Modal.Header>
    <Modal.Body><div className="row g-3">
      <div className="col-12">
        <label className="form-label" htmlFor="avatar">Foto de perfil</label>
        <input id="avatar" className="form-control" type="file" accept="image/*" onChange={choose} />
        <small className="text-muted">JPG, PNG o WebP. Máximo 8 MB.</small>
        {source && <><div className="position-relative mt-3" style={{ height:260, background:'#172b4d' }}><Cropper image={source} crop={crop} zoom={zoom} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)} /></div><div className="d-flex gap-2 align-items-center mt-2"><input aria-label="Zoom de foto" type="range" min="1" max="3" step=".1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /><Button size="sm" variant="outline-primary" onClick={confirmCrop}>Confirmar recorte</Button>{avatar && <span className="text-success small">Foto lista para subir</span>}</div></>}
      </div>
      <div className="col-md-6"><label className="form-label" htmlFor="firstName">Nombre</label><input id="firstName" className="form-control" value={values.firstName} onChange={update('firstName')} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="lastName">Apellido</label><input id="lastName" className="form-control" value={values.lastName} onChange={update('lastName')} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="phone">Teléfono</label><input id="phone" className="form-control" value={values.phone} onChange={update('phone')} /></div>
      <><div className="col-12"><div className="border-top pt-3 mt-1"><h3 className="h6 mb-1">Credenciales de acceso</h3><p className="small text-muted mb-0">{isEditing ? 'Actualizá el email de acceso o definí una nueva contraseña. Dejala vacía para conservar la actual.' : 'Estos datos permitirán al usuario iniciar sesión en CloudSuite.'}</p></div></div>
      <div className="col-md-6"><label className="form-label" htmlFor="email">Email</label><input id="email" type="email" className="form-control" value={values.email} onChange={update('email')} /></div>
      <div className="col-md-6"><label className="form-label" htmlFor="password">{isEditing ? 'Nueva contraseña' : 'Contraseña'}</label><input id="password" type="password" className="form-control" value={values.password} onChange={update('password')} autoComplete="new-password" /></div>
      <div className="col-12"><div className="border-top pt-3 mt-1"><h3 className="h6 mb-1">Asignación en campaña</h3><p className="small text-muted mb-0">Definí dónde trabajará la persona y qué responsabilidad tendrá.</p></div></div>
      <div className="col-md-4"><label className="form-label" htmlFor="campaign">Campaña</label><SelectControl id="campaign" ariaLabel="Campaña" label={campaigns.find(item => item.id === values.campaignId)?.name ?? 'Sin campaña por ahora'} options={[{ value:'', label:'Sin campaña por ahora' }, ...campaigns.map(item => ({ value:item.id, label:item.name }))]} value={values.campaignId} onChange={selectCampaign} /></div>
      <div className="col-md-4"><label className="form-label" htmlFor="create-function">Función</label><SelectControl id="create-function" ariaLabel="Función" disabled={!values.campaignId} label={functions.find(item => item.id === values.functionId)?.name ?? 'Sin asignar'} options={[{ value:'', label:'Sin asignar' }, ...functions.map(item => ({ value:item.id, label:item.name }))]} value={values.functionId} onChange={functionId => setValues({ ...values, functionId })} /></div>
      <div className="col-md-4"><label className="form-label" htmlFor="team">Equipo</label><SelectControl id="team" ariaLabel="Equipo" disabled={!values.campaignId} label={!values.campaignId ? 'Elegí una campaña primero' : teams.find(item => item.id === values.teamId)?.name ?? 'Sin asignar'} options={[{ value:'', label:'Sin asignar' }, ...teams.map(item => ({ value:item.id, label:item.name }))]} value={values.teamId} onChange={teamId => setValues({ ...values, teamId })} /></div></>
    </div>{error && <p role="alert" className="text-danger small mt-3 mb-0">{error}</p>}</Modal.Body>
    <Modal.Footer><Button variant="secondary" onClick={onHide} disabled={saving}>Cancelar</Button><Button onClick={() => void submit()} disabled={saving}>{saving ? (isEditing ? 'Guardando…' : 'Creando…') : (isEditing ? 'Guardar cambios' : 'Crear usuario')}</Button></Modal.Footer>
  </Modal>;
}
