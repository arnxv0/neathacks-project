import "./index.css";
import { Composition } from "remotion";
import { Explainer, FPS, TOTAL } from "./Explainer";
import { defaultProps } from "./data/props";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="PreflightExplainer" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={defaultProps} />
    <Composition id="PreflightExplainerVertical" component={Explainer} durationInFrames={TOTAL} fps={FPS} width={1080} height={1920} defaultProps={defaultProps} />
  </>
);
