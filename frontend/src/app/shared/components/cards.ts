/// Barrel des cartes de synthèse — chaque composant vit dans son propre fichier
/// (`metric-card.component.ts`, `stat-card.component.ts`). Ce ré-export évite de
/// modifier les importateurs tout en respectant « un composant par fichier ».
export { MetricCardComponent, type MetricTone } from './metric-card.component';
export { StatCardComponent } from './stat-card.component';
