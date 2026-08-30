-- High-level teacher-selected observation focus. Historical observations stay
-- null because assigning a category retrospectively would create false data.
alter table tongji_v3.observations
  add column if not exists observation_focus_category text
    check (observation_focus_category in ('materials_tools', 'cognition_experience', 'social_experience'));

comment on column tongji_v3.observations.observation_focus_category is
  '教师单选观察聚焦：材料与工具、认知与经验、交往与经验；历史记录可为空。';

notify pgrst, 'reload schema';
