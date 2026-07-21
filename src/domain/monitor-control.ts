export class MonitorControl {
  generation = 0;
  manuallyStopped = false;
  status: "off" | "active" | "checking" | "stopping" = "off";
  nextScan?: string;
  timers = 0;
  automations = 0;
  start() {
    this.generation++;
    this.manuallyStopped = false;
    this.status = "active";
    return this.generation;
  }
  checking() {
    this.status = "checking";
    return this.generation;
  }
  stop(force = false) {
    this.status = "stopping";
    this.generation++;
    this.manuallyStopped = true;
    this.nextScan = undefined;
    this.timers = 0;
    this.automations = 0;
    this.status = "off";
    return force;
  }
  isCurrent(generation: number) {
    return (
      generation === this.generation &&
      this.status !== "off" &&
      this.status !== "stopping"
    );
  }
  canAutoStart(allowAfterManual: boolean) {
    return this.status === "off" && (!this.manuallyStopped || allowAfterManual);
  }
}
