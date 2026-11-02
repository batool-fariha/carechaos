"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeMetrics, evaluate, Simulation, type Evaluation, type ExperimentConfig, type FaultConfig, type RunStatus, type ServiceId, type SimulationResult } from "@/engine";

export const SPEEDS = [
  { label: "1×", value: 1 },
  { label: "10×", value: 10 },
  { label: "30×", value: 30 },
  { label: "100×", value: 100 },
];

const TICK_MS = 100;

export interface SimController {
  config: ExperimentConfig;
  status: RunStatus;
  result: SimulationResult;
  metrics: ReturnType<typeof computeMetrics>;
  evaluation: Evaluation | null;
  speed: number;
  setSpeed: (n: number) => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
  replay: () => void;
  skipToEnd: () => void;
  recover: (s: ServiceId) => void;
  inject: (f: FaultConfig) => void;
  loadConfig: (c: ExperimentConfig) => void;
}

/**
 * Drives a Simulation from the browser. The engine itself is virtual-time; this hook only decides how fast
 * virtual time advances relative to the wall clock, and calls `onFinish` once when a run completes or is stopped.
 */
export function useSimulation(initial: ExperimentConfig, onFinish?: (ev: Evaluation) => void): SimController {
  const simRef = useRef<Simulation | null>(null);
  if (!simRef.current) simRef.current = new Simulation(initial);
  const [version, setVersion] = useState(0);
  const [speed, setSpeed] = useState(30);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const reported = useRef(false);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const sim = simRef.current;

  const checkFinish = useCallback(() => {
    const s = simRef.current!;
    if ((s.status === "completed" || s.status === "stopped") && !reported.current) {
      reported.current = true;
      finishRef.current?.(evaluate(s.getResult()));
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const s = simRef.current!;
      if (s.status !== "running") return;
      s.advanceTo(s.nowSec + (TICK_MS / 1000) * speed);
      bump();
      checkFinish();
    }, TICK_MS);
    return () => clearInterval(id);
  }, [speed, bump, checkFinish]);

  const act = (fn: (s: Simulation) => void) => () => {
    fn(simRef.current!);
    bump();
    checkFinish();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => sim.getResult(), [version, sim]);
  const metrics = useMemo(() => computeMetrics(result), [result]);
  const evaluation = useMemo(() => (result.status === "completed" || result.status === "stopped" ? evaluate(result) : null), [result]);

  return {
    config: result.config,
    status: sim.status,
    result,
    metrics,
    evaluation,
    speed,
    setSpeed,
    start: act((s) => {
      reported.current = false;
      s.start();
    }),
    pause: act((s) => s.pause()),
    resume: act((s) => s.resume()),
    stop: act((s) => s.stop()),
    reset: act((s) => {
      reported.current = false;
      s.reset();
    }),
    replay: act((s) => {
      reported.current = false;
      s.replay();
    }),
    skipToEnd: act((s) => {
      if (s.status === "running" || s.status === "paused") {
        s.resume();
        s.advanceTo(s.config.durationSec);
      }
    }),
    recover: (svc) => {
      sim.recoverService(svc);
      bump();
    },
    inject: (f) => {
      sim.injectFault(f);
      bump();
    },
    loadConfig: (c) => {
      reported.current = false;
      simRef.current = new Simulation(c);
      bump();
    },
  };
}
