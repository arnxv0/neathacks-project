// Real numbers from out/report.json are injected here (see scripts/video-props.py). Placeholders until then.
export type ExplainerProps = {
  before: number; after: number; total: number; clusters: number; fixes: number;
  replayBefore: string; replayAfter: string; costPerRun: number; costPerAssessment: number; repoUrl: string;
  regressionCommit: string;
};
export const defaultProps: ExplainerProps = {
  "before": 23,
  "after": 0,
  "total": 50,
  "clusters": 15,
  "fixes": 15,
  "replayBefore": "0/1",
  "replayAfter": "5/5",
  "costPerRun": 0.00603,
  "costPerAssessment": 37.0581,
  "repoUrl": "github.com/arnxv0/neathacks-project",
  "regressionCommit": "a1b2c3d"
};
