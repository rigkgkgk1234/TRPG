import type { DailyActionId, JobId, RegionId } from "@/core/types";
import {
  BarbellIcon, BedIcon, CastleTurretIcon, ChalkboardTeacherIcon, CompassIcon, TreeIcon, HammerIcon, PlantIcon, StorefrontIcon, TargetIcon, type Icon,
} from "@/ui/icons";

/** 직업·행동마다 쓰는 아이콘. 같은 대상은 어느 화면에서나 같은 아이콘. */
export const JOB_ICON: Record<JobId, Icon> = {
  farmer: PlantIcon,
  smith: HammerIcon,
  hunter: TargetIcon,
  herbalist: PlantIcon,
  errand: StorefrontIcon,
};

export const ACTION_ICON: Partial<Record<DailyActionId, Icon>> = {
  trainSolo: BarbellIcon,
  trainLesson: ChalkboardTeacherIcon,
  explore: CompassIcon,
  rest: BedIcon,
  village: StorefrontIcon,
};

export const REGION_ICON: Partial<Record<RegionId, Icon>> = {
  forest: TreeIcon,
  watchtower: CastleTurretIcon,
};
