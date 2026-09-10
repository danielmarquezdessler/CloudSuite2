import { useMemo, useState, type CSSProperties } from 'react';
import { Icon } from '../Shared/Icons';

export type OrgChartMember = {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  functionName: string;
  functionColor: string;
  teamName: string;
  reportsTo: string | null;
};

function initials(member: OrgChartMember) {
  return member.displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || member.email.slice(0, 2).toUpperCase();
}

function PersonNode({ member, childrenByManager, onSelect }: { member: OrgChartMember; childrenByManager: Map<string, OrgChartMember[]>; onSelect: (member: OrgChartMember) => void }) {
  const [photoUnavailable, setPhotoUnavailable] = useState(false);
  const children = childrenByManager.get(member.uid) ?? [];
  return <li className="cd-org-chart__branch">
    <button type="button" className="cd-org-chart__node" onClick={() => onSelect(member)} aria-label={`Editar responsable de ${member.displayName}`}>
      {member.photoURL && !photoUnavailable ? <img className="cd-org-chart__avatar" src={member.photoURL} alt="" onError={() => setPhotoUnavailable(true)} /> : <span className="cd-org-chart__avatar cd-org-chart__avatar--fallback" aria-hidden="true">{initials(member)}</span>}
      <span className="cd-org-chart__copy"><strong>{member.displayName}</strong><span className="cd-org-chart__role" style={{ '--role-color': member.functionColor } as CSSProperties}>{member.functionName}</span><small>{member.teamName}</small></span>
      <Icon name="chevron-right" size={16} color="#6b86ad" />
    </button>
    {children.length > 0 && <ul className="cd-org-chart__children">{children.map((child) => <PersonNode key={child.uid} member={child} childrenByManager={childrenByManager} onSelect={onSelect} />)}</ul>}
  </li>;
}

export function availableManagers(member: OrgChartMember, members: OrgChartMember[]) {
  const reportsTo = new Map(members.map((item) => [item.uid, item.reportsTo]));
  return members.filter((candidate) => {
    if (candidate.uid === member.uid) return false;
    const visited = new Set<string>();
    let current: string | null | undefined = candidate.uid;
    while (current) {
      if (current === member.uid) return false;
      if (visited.has(current)) return false;
      visited.add(current);
      current = reportsTo.get(current);
    }
    return true;
  });
}

export default function OrgChart({ members, onSelect }: { members: OrgChartMember[]; onSelect: (member: OrgChartMember) => void }) {
  const { roots, childrenByManager } = useMemo(() => {
    const known = new Set(members.map((member) => member.uid));
    const children = new Map<string, OrgChartMember[]>();
    members.forEach((member) => { if (member.reportsTo && known.has(member.reportsTo)) children.set(member.reportsTo, [...(children.get(member.reportsTo) ?? []), member]); });
    const roots = members.filter((member) => !member.reportsTo || !known.has(member.reportsTo));
    return { roots: roots.length ? roots : members, childrenByManager: children };
  }, [members]);
  return <div className="cd-org-chart" data-testid="org-chart"><p className="cd-org-chart__hint">Seleccioná una persona para asignar a quién reporta.</p><ul className="cd-org-chart__roots">{roots.map((member) => <PersonNode key={member.uid} member={member} childrenByManager={childrenByManager} onSelect={onSelect} />)}</ul></div>;
}
