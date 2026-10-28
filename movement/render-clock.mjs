// Bound 3D work while leaving camera capture and controls on every animation frame.
export class RenderClock {
  constructor(fps=60) { this.period=1000/fps; this.next=null; this.last=null; }
  step(now) {
    if (!Number.isFinite(now)) return null;
    if (this.next !== null && now + .25 < this.next) return null;
    const dt=this.last === null ? this.period/1000 : Math.min(.1,Math.max(0,(now-this.last)/1000));
    this.last=now;
    this.next=this.next === null ? now+this.period : this.next + Math.max(1,Math.floor((now-this.next+.25)/this.period)+1)*this.period;
    return dt;
  }
}
