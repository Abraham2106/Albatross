import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { container } from '../../bootstrap';
import { Capture, CaptureInput, DemoScenario, EquipmentDraft, Hospital } from '../../application/ports/CaptureManagementPort';
import { ComputerConnectionState, PairingStatus } from '../../application/ports/ComputerConnectionPort';
interface AppContextValue {
  connection: ComputerConnectionState; captures: Capture[]; hospitals: Hospital[]; scenario: DemoScenario;
  setScenario: (scenario: DemoScenario) => void; setPairingStatus: (status: PairingStatus) => void;
  pairComputer: () => Promise<void>; disconnectComputer: () => Promise<void>;
  createCapture: (input: CaptureInput) => Promise<Capture>; updateDraft: (id: string, draft: EquipmentDraft) => Promise<Capture>;
  setStatus: (id: string, status: Capture['status']) => Promise<Capture>; acceptDraft: (id: string) => Promise<Capture>;
  cancelCapture: (id: string) => Promise<Capture>; resetDemo: () => void;
}
const Context = createContext<AppContextValue | undefined>(undefined);
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connection, setConnection] = useState(container.computer.getConnectionState());
  const [captures, setCaptures] = useState<Capture[]>([]); const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [scenario, setScenarioState] = useState<DemoScenario>('normal');
  useEffect(() => { const offConnection = container.computer.subscribe(setConnection); const offCaptures = container.captures.subscribe(setCaptures); container.captures.listHospitals().then(setHospitals); return () => { offConnection(); offCaptures(); }; }, []);
  const value = useMemo<AppContextValue>(() => ({
    connection, captures, hospitals, scenario,
    setScenario: (next) => { setScenarioState(next); container.captures.setScenario(next); if (next === 'offline') container.computer.setDemoStatus('disconnected'); },
    setPairingStatus: (status) => container.computer.setDemoStatus(status),
    pairComputer: async () => { await container.computer.pair(); }, disconnectComputer: async () => { await container.computer.disconnect(); },
    createCapture: (input) => container.captures.createCapture(input), updateDraft: (id, draft) => container.captures.updateDraft(id, draft),
    setStatus: (id, status) => container.captures.setStatus(id, status), acceptDraft: (id) => container.captures.acceptDraft(id),
    cancelCapture: (id) => container.captures.cancelCapture(id), resetDemo: () => { setScenarioState('normal'); container.captures.reset(); container.computer.setDemoStatus('disconnected'); },
  }), [captures, connection, hospitals, scenario]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
};
export const useAppContext = () => { const value = useContext(Context); if (!value) throw new Error('useAppContext debe usarse dentro de AppProvider'); return value; };
