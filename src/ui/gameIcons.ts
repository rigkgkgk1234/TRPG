import type { ExerciseStat } from "@/core/labels";
import type { DailyActionId, JobId, RegionId, SkillId } from "@/core/types";
import {
  BarbellIcon, BedIcon, CastleTurretIcon, ChalkboardTeacherIcon, CompassIcon, CrosshairIcon, EyeIcon, HammerIcon, HeartbeatIcon, HouseLineIcon, MountainsIcon, PersonSimpleRunIcon,
  PlantIcon, ShieldIcon, StorefrontIcon, SwordIcon, TargetIcon, TreeIcon, WavesIcon, type Icon,
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

/** 혼자 훈련의 운동: 단련하는 능력치 */
export const EXERCISE_ICON: Record<ExerciseStat, Icon> = {
  str: BarbellIcon,
  agi: PersonSimpleRunIcon,
  con: HeartbeatIcon,
  per: EyeIcon,
};

/** 교습에서 배우는 숙련 (활은 사냥꾼 직업 아이콘과 겹치지 않게 조준선) */
export const SKILL_ICON: Partial<Record<SkillId, Icon>> = {
  blade: SwordIcon,
  blunt: HammerIcon,
  bow: CrosshairIcon,
  guard: ShieldIcon,
};

export const REGION_ICON: Partial<Record<RegionId, Icon>> = {
  forest: TreeIcon,
  watchtower: CastleTurretIcon,
  marsh: WavesIcon,
  mine: MountainsIcon,
  hamlet: HouseLineIcon,
};
