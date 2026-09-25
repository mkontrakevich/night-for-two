export function createLoveStoryLearningEngine(){
  const noop=async()=>null;
  return {
    init:async()=>true,
    recordPrivateChoice:noop,
    recordSharedMatch:noop,
    recordOutcome:noop,
    recordSignal:noop,
    rebuild:async()=>({owner:[],partner:[],couple:[]}),
    upsertHypothesis:noop,
    directorContext:async()=>({owner:[],partner:[],couple:[],hypotheses:[],source:'app_local_no_relationship_learning'})
  };
}
