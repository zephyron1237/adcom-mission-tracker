function main() {
  let missionData = getEventMissionData();
  let markup = getWikiMarkup(missionData);
  document.getElementById('wiki').innerHTML = markup;
}

// e.g., {MaxRank: 21, 1: [...]}, 2: [...], ..., 21: [...],}
function getEventMissionData() {
  let missionData = {};
  
  let rank = 0;
  let missionsLeft = 0;
  for (let missionIndex in DATA.event.Missions) {
    if (missionsLeft == 0) {
      rank += 1;
      missionData.MaxRank = rank;
      
      if (rank >= DATA.event.Ranks.length) {
        // I'm not sure how the game presents this, but the stretch goals will be considered of one next rank
        missionsLeft = DATA.event.Ranks.length - missionIndex;
      } else {
        missionsLeft = parseInt(DATA.event.Ranks[rank].Missions);
      }
      
      missionData[rank] = [];
    
      if (rank == 1) {
        // There's extra missions (to have choices)
        let missionsShown = 3;
        if (rank < DATA.event.Ranks.length) {
          missionsShown = parseInt(DATA.event.Ranks[rank].ActiveMissionCount);
        }        
        missionsLeft += (missionsShown - 1);
      }
    }
    
    let mission = DATA.event.Missions[missionIndex];
    mission.Rank = rank;
    mission.Index = parseInt(missionIndex);
    missionData[mission.Rank].push(mission);
    
    missionsLeft -= 1;
  }
  
  return missionData;
}

// Returns string containing the markup for the ==Missions== section of event wiki pages.
function getWikiMarkup(missionData) {
  let markup = "==Missions==\n";
  
  for (let rank = 1; rank <= missionData.MaxRank; rank++) {
    markup += `===Rank ${rank}===\n` +
              `{{Mission table begin}}\n`;
    
    for (let mission of missionData[rank]) {
      markup += getMissionMarkup(mission);
    }
    
    markup += `{{Mission table end}}\n`;
  }
  
  return markup;
}

function getMissionMarkup(mission) {
  let reward = getReward(mission);
  
  let markup = `{{Mission table row|num = ${mission.Index + 1}|`;
  
  let condition = mission.Condition;
  switch (condition.ConditionType) {
    case "TradesSinceSubscription":
      markup += `type = trade|res = |qty = ${condition.Threshold}|rew = ${getReward(mission)}|ind = ${getLowerResourceName(condition.ConditionId)}}}\n`;
      break;
    case "ResearchersUpgradedSinceSubscription":
      markup += `type = upgrade|res = card|qty = ${condition.Threshold}|rew = ${getReward(mission)}}}\n`;
      break;
    case "ResourcesEarnedSinceSubscription":
    case "ResourceQuantity":
      markup += `type = collect|res = ${condition.ConditionId}|qty = ${bigNum(condition.Threshold)}|rew = ${getReward(mission)}}}\n`;
      break;
    case "IndustryUnlocked":
      let resourceId = getResourceByIndustry(condition.ConditionId).Id;
      markup += `type = unlock|res = |qty = |rew = ${getReward(mission)}|ind = ${getLowerResourceName(resourceId)}}}\n`;
      break;
    case "ResearcherCardsEarnedSinceSubscription":
      markup += `type = collect|res = card|qty = ${bigNum(condition.Threshold)}|rew = ${getReward(mission)}}}\n`;
      break;
    case "ResourcesSpentSinceSubscription":
      markup += `type = spend|res = ${getLowerResourceName(condition.ConditionId)}|qty = ${condition.Threshold}|rew = ${getReward(mission)}}}\n`;
      break;
    default:
      return `Unknown mission condition: ${condition.ConditionType}`;
  }
  
  return markup;
}

// returns "plastic" or "armored"
function getReward(mission) {
  let gachaScript = DATA.event.GachaScripts.find(gs => gs.GachaId == mission.Reward.RewardId);
  
  if (gachaScript) {
    return gachaScript.MimicGachaId;
  } else {
    return mission.Reward.RewardId;
  }
}

// returns the Resource object associated with a given industryId
function getResourceByIndustry(industryId) {
  // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
  industryId = industryId.toLowerCase();
  let industryIndex = DATA.event.Industries.findIndex(i => i.Id == industryId);
  return DATA.event.Resources[industryIndex];
}

// returns the lowercase name of a given resourceId. I guess this is what the wiki uses for industries???
function getLowerResourceName(resourceId) {
  let resource = DATA.event.Resources.find(r => r.Id == resourceId);
  return resource.Singular.toLowerCase();
}

// Converts numbers to AdCom style. bigNum(1E21) => "1 CC"
function bigNum(x) {
  if (x < 1e+6) {
    return x.toLocaleString();
  }
  
  let digits = Math.floor(Math.log10(x));
  let thousands = Math.floor(digits / 3);
  let mantissa = x / Math.pow(10, thousands * 3);
  return `${+mantissa.toFixed(2)} ${POWERS[thousands - 1]}`;
}

// Converts AdCom style numbers to normal. fromBigNum("1 CC") => 1E21
function fromBigNum(x) {
  // TODO: make a better regex that can pick up non-spaces maybe?
  if (x == null) {
    return NaN;
  }

  let split = x.toString().trim().split(/ +/);
  
  if (split.length == 1) {
    return parseLocaleNumber(split[0]);
    
  } else if (split.length == 2) {    
    let powerIndex = POWERS.indexOf(split[1].toUpperCase());
    let mantissa = parseLocaleNumber(split[0]);
    if (powerIndex != -1 && !isNaN(mantissa)) {
      return mantissa * Math.pow(1000, powerIndex + 1);
    }
  }
  
  return NaN;
}


main();
