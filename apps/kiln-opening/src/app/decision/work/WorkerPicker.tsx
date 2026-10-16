/**
 * WorkerPicker (UI_V1.6.1_ARCHITECTURE §3.4; wireframe `decWork` worker picker). Owner: B4.
 *
 * The entries of `placementOptions()[i].workers`: Shifu, Apprentice, and Apprentice-as-Shifu
 * when Senior Apprentice applies somewhere (with its rules details). Native radios named
 * `worker`, valued by `placementWorkerKey` (never a worker ID, D9). A worker legal nowhere stays
 * focusable with its reason.
 */
import { techName, workerKindName } from "../../i18n/content.ts";
import { useT } from "../../i18n/I18nProvider.tsx";
import { OptionCard } from "../../kit/OptionCard.tsx";
import { OptionGroup } from "../../kit/OptionGroup.tsx";
import { WorkerPiece } from "../../pieces/WorkerPiece.tsx";
import { RulesDetail } from "../../rules/RulesDetail.tsx";
import type { WorkerChoice } from "./workDraft.ts";

const SENIOR_APPRENTICE = "T18" as const;

export interface WorkerPickerProps {
  workers: readonly WorkerChoice[];
  value: string | null;
  onChange: (workerKey: string) => void;
  /** The viewer's seat (worker colour). */
  seat: number;
}

export function WorkerPicker({ workers, value, onChange, seat }: WorkerPickerProps) {
  const t = useT();
  return (
    <OptionGroup legend={t("work.work.step.worker")} step={1} name="worker" value={value} onChange={(key) => onChange(key)} layout="grid">
      {workers.map((worker) => {
        const name = workerKindName(worker.kind, t.locale);
        const title = worker.senior ? t("work.work.workerSenior", { worker: name, shifu: workerKindName("shifu", t.locale) }) : name;
        return (
          <OptionCard
            key={worker.key}
            value={worker.key}
            title={title}
            leading={<WorkerPiece kind={worker.kind} seat={seat} own decorative senior={worker.senior} />}
            meta={worker.available > 0 ? t("work.work.availableN", { n: worker.available }) : t("work.work.noneAvailable")}
            description={worker.senior ? techName(SENIOR_APPRENTICE, t.locale) : undefined}
            disabled={!worker.legal}
          >
            {worker.senior ? <RulesDetail subject={{ kind: "tech", id: SENIOR_APPRENTICE }} /> : null}
          </OptionCard>
        );
      })}
    </OptionGroup>
  );
}
