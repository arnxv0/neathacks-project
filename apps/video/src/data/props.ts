// Real numbers from out/report.json are injected here (see scripts/video-props.py). Placeholders until then.
export type ExplainerProps = {
  before: number; after: number; total: number; clusters: number; fixes: number;
  replayBefore: string; replayAfter: string; costPerRun: number; costPerAssessment: number; repoUrl: string;
  regressionCommit: string;
};
export const defaultProps: ExplainerProps = {
  before: 11, after: 1, total: 20, clusters: 4, fixes: 4, replayBefore: "0/3", replayAfter: "6/6",
  costPerRun: 0.012, costPerAssessment: 2.94, repoUrl: "github.com/arnxv0/neathacks-project", regressionCommit: "a1b2c3d",
};
