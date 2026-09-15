import { useEffect, useRef } from 'react';
import createGlobe from 'cobe';

type CampaignLocationGlobeProps = {
  location?: { lat: number | null; lng: number | null; address?: string };
  partyName?: string;
  partyLogoUrl?: string | null;
};

/** A lightweight, rotating campaign globe. Cobe renders to a canvas so it does
 * not compete with Google Maps or require a second mapping API. */
export default function CampaignLocationGlobe({ location, partyName, partyLogoUrl }: CampaignLocationGlobeProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvas.current) return undefined;
    let phi = 0;
    const canvasElement = canvas.current;
    const dimensions = () => ({ width: Math.max(1, canvasElement.offsetWidth * 2), height: Math.max(1, canvasElement.offsetHeight * 2) });
    const globe = createGlobe(canvasElement, {
      devicePixelRatio: Math.min(window.devicePixelRatio, 2),
      ...dimensions(),
      phi: 0,
      theta: 0.24,
      dark: 0,
      diffuse: 1.3,
      mapSamples: 16000,
      mapBrightness: 5,
      baseColor: [0.16, 0.39, 0.78],
      markerColor: [0.84, 0, 0.55],
      glowColor: [0.81, 0.89, 1],
      markers: location?.lat != null && location.lng != null ? [{ location: [location.lat, location.lng], size: 0.1 }] : []
    });
    let frame = 0;
    const rotate = () => { globe.update({ phi }); phi += 0.0035; frame = window.requestAnimationFrame(rotate); };
    frame = window.requestAnimationFrame(rotate);
    const resize = new ResizeObserver(() => globe.update(dimensions())); resize.observe(canvasElement);
    return () => { window.cancelAnimationFrame(frame); resize.disconnect(); globe.destroy(); };
  }, [location?.lat, location?.lng]);

  return <section className="campaign-globe" data-card="true" aria-label="Ubicación global de la campaña" data-campaign-location={location?.lat != null && location.lng != null ? 'configured' : 'missing'}>
    <canvas ref={canvas} />
    <div className="campaign-globe__copy">
      {partyLogoUrl && <img src={partyLogoUrl} alt="Logo del partido" />}
      <div><span>Ubicación de campaña</span><strong>{partyName || 'Configurá tu partido'}</strong><small>{location?.address || 'Agregá una dirección en Configuración Global'}</small></div>
    </div>
  </section>;
}
