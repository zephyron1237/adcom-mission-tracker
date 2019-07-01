var missionData = {};

function main() {
  initializeMissionData();
  initializeInfoPopup();
  loadSaveData();
  renderMissions();
}

// e.g., {1: {StartingCount: 3, Remaining: [...]}, 2: {...}, Completed: {...}, Current: {...}}
function initializeMissionData() {
  missionData = {Completed: {StartingCount: 0, Remaining: []}, Current: {StartingCount: 3, Remaining: []}};
  
  let rank = 0;
  let missionsLeft = 0;
  for (let missionIndex in DATA.Missions) {
    if (missionsLeft == 0) {
      rank += 1;      
      missionsLeft = parseInt(DATA.Ranks[rank].Missions);      
      missionData[rank] = {StartingCount: missionsLeft, Remaining: []};
    
      if (rank == 1) {
        missionsLeft += 2; // There's two extra missions (to have choices)
      }
    }
    
    let mission = DATA.Missions[missionIndex];
    mission.Rank = rank;
    mission.Index = parseInt(missionIndex);
    missionData[rank].Remaining.push(mission);
    
    missionsLeft -= 1;
  }
  
  for (let i = 0; i < 3; i++) {
    // TODO: Refactor if a first rank has 2 or less missions
    missionData.Current.Remaining.push(missionData[1].Remaining.shift());
  }
}

function initializeInfoPopup() {
  /* Based on code from https://getbootstrap.com/docs/4.0/components/modal/ */
  $('#infoPopup').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget); // Button that triggered the modal
    let missionId = button.data('mission'); // Extract info from data-* attributes
    if (!missionId) {
      return;
    }
    
    let mission = DATA.Missions.find(m => m.Id == missionId);
    
    let modal = $(this);
    modal.find('.modal-title').text(describeMission(mission, "none"));
    modal.find('#infoReward').html(describeReward(mission.Reward));
    modal.find('#calc').html(renderCalculator(mission));
    
    $(function () {
      $('[data-toggle="popover"]').popover();
      loadFormValues();
    });
  });
}

function loadSaveData() {
  // Load configuration first
  let iconConfig = localStorage.getItem("IconConfig") || "image";
  setIcons(iconConfig);
  
  let styleConfig = localStorage.getItem("StyleConfig") || "light";
  setStyle(styleConfig);
  
  if (localStorage.getItem("event-CompletedVisible") == null) {
    let isNewSave = (localStorage.getItem("event-Completed") == null);
    localStorage.setItem("event-CompletedVisible", isNewSave.toString());  // New saves start open
  }
  
  // Now load mission progress
  let loadedEventId = localStorage.getItem("event-Id");
  if (loadedEventId != null && loadedEventId != EVENT_ID) {
    // This save is from a previous event, so let's clear our save.
    // TODO: It might be nice to inform the user this just happened besides the log.
    console.log(`Event ${loadedEventId} is outdated.  Clearing save data.`);
    localStorage.removeItem("event-Completed");
    localStorage.removeItem("event-FormValues");
    localStorage.setItem("event-Id", EVENT_ID);
  } else {
    let dataString = localStorage.getItem("event-Completed");
    if (dataString) {
      // Iterate through every mission in every rank, move completed ones to Completed.
      /* This is a little inefficient, but it preserves the completion order. */
      let completedIds = dataString.split(',');
      for (let completedId of completedIds) {
        if (!completedId) {
          break;
        }
        
        for (let rank in missionData) {
          if (rank == "Completed") {
            continue;
          }
          
          for (let missionIndex = 0; missionIndex < missionData[rank].Remaining.length; missionIndex++) {
            let mission = missionData[rank].Remaining[missionIndex];          
            if (completedId == mission.Id) {
              missionData[rank].Remaining.splice(missionIndex, 1);
              missionData.Completed.Remaining.push(mission);
              completedId = null;
              break;
            }
          }
        }
      }
      
      // Now find the lowest-rank missions to fill in Current.
      let missionsNeeded = missionData.Current.StartingCount - missionData.Current.Remaining.length;
      for (let rank = 1; rank < DATA.Ranks.length; rank++) {
        if (missionsNeeded == 0) {
          break;
        }
        
        while (missionData[rank].Remaining.length != 0 && missionsNeeded != 0) {
          let newMission = missionData[rank].Remaining.shift();
          missionData.Current.Remaining.push(newMission);
          missionsNeeded -= 1;
        }
      }
    }
  }
}

function updateSaveData() {
  let saveData = missionData.Completed.Remaining.map(m => m.Id).join(',');
  localStorage.setItem("event-Completed", saveData);
  localStorage.setItem("event-Id", EVENT_ID);
}

function renderMissions() {
  let missionHtml = "";
  
  let sortedRanks = Object.keys(missionData);
  sortedRanks.splice(sortedRanks.indexOf("Completed"), 1);
  sortedRanks.splice(sortedRanks.indexOf("Current"), 1);
  sortedRanks.unshift("Current");
  sortedRanks.unshift("Completed");
  
  for (let rank of sortedRanks) {
    if (missionData[rank].Remaining.length == 0 && rank != 'Completed') {
      continue;
    }
    
    let title;
    let bodyStyle = "";
    if (rank == "Completed") {
      let checked = "";
      if (localStorage.getItem("event-CompletedVisible") == "true") {
        checked = "checked";
      } else {        
        bodyStyle = "style='display: none;'";
      }
      title = `${rank} <label class="switch float-right"><input type="checkbox" ${checked} onclick="toggleCompleted()"><span class="slider round"></span>`; 
    } else if (rank == "Current") {
      // Find lowest rank with a remaining mission.
      let rankTitle = "Complete!";
      for (let findRank = 1; findRank < DATA.Ranks.length; findRank++) {
        if (missionData[findRank].Remaining.length != 0) {
          if (missionData[findRank].Remaining.length == missionData[findRank].StartingCount) {
            // This is a full rank, the lowest rank is actually the previous one.
            let prevStartCount = missionData[findRank - 1].StartingCount;
            rankTitle = `${(findRank - 1)} (${prevStartCount - 1}/${prevStartCount})`
          } else {
            let missingCount = missionData[findRank].StartingCount - missionData[findRank].Remaining.length;
            rankTitle = `${findRank} (${missingCount - 1}/${missionData[findRank].StartingCount})`;
          }
          break;
        }
      }
      
      title = `Current <span class="currentRank float-right">Rank ${rankTitle}</span>`;
    } else {
      title = `Rank ${rank}`;
    }
    
    missionHtml += `<div class='card mx-2 mt-1'><h4 class="card-header">${title}</h4><div id="${rank}-body" class="card-body" ${bodyStyle}>`;
    
    if (rank == "Completed" && missionData.Completed.Remaining.length == 0) {
      missionHtml += `<ul><li class="my-1">Click <strong>Current</strong> missions to move them to Completed.</li>`;
      missionHtml += `<li class="my-1">Click <strong>Completed</strong> missions to move them back to Current.</li>`;
      missionHtml += `<li class="my-1">Click this tab's toggle in the top-right to hide Completed missions.</li></ul>`;
    }
    
    for (let mission of missionData[rank].Remaining) {
      missionHtml += `<span class="missionContainer">${renderMissionButton(mission, rank)}</span>`;
    }
    missionHtml += "</div></div>";
  }
  
  document.getElementById('missions').innerHTML = missionHtml;
}

function renderMissionButton(mission, rank) {
  let type = mission.Condition.ConditionType;
  let buttonClass = "";
  
  if (!missionData.Current.Remaining.includes(mission) && !missionData.Completed.Remaining.includes(mission)) {
    buttonClass = "disabled ";
  }
  
  let buttonOutlineStyle = (rank == "Completed") ? "btn" : "btn-outline";
  
  let buttonDescription = "";
  if (rank == "Completed") {
    buttonDescription = "Uncomplete mission"
  } else if (rank == "Current") {
    buttonDescription = "Complete mission"
  }
  
  if (type == "ResourcesSpentSinceSubscription" || type == "ResearchersUpgradedSinceSubscription") {
    buttonClass += `${buttonOutlineStyle}-danger`;
  } else if (type == "ResearcherCardsEarnedSinceSubscription") {
    buttonClass += `${buttonOutlineStyle}-success`;
  } else {
    buttonClass += `${buttonOutlineStyle}-secondary`;
  }
  
  return `<button class="btn ${buttonClass}" onclick="clickMission('${mission.Id}')" title="${buttonDescription}">${describeMission(mission)}</button><a href="#" class="btn btn-link" data-toggle="modal" data-target="#infoPopup" data-mission="${mission.Id}"><strong>&#9432;</strong></a>`;
}

function clickMission(missionId) {
  let foundIndex;
  if (-1 != (foundIndex = missionData.Current.Remaining.findIndex(m => m.Id == missionId))) {
    // Clicked a Current mission, finish it
    let mission = missionData.Current.Remaining[foundIndex];
    missionData.Current.Remaining.splice(foundIndex, 1);
    missionData.Completed.Remaining.push(mission);
    
    // Find a new mission to replace it with
    for (let rank = 1; rank < DATA.Ranks.length; rank++) {
      if (missionData[rank].Remaining.length > 0) {
        let newMission = missionData[rank].Remaining.shift();
        missionData.Current.Remaining.push(newMission);
        break;
      }
    }
    
    updateSaveData();
    renderMissions();
  } else if (-1 != (foundIndex = missionData.Completed.Remaining.findIndex(m => m.Id == missionId))) {
    // Clicked a Completed mission, undo it to Current
    // But first, kick out the newest (highest-index) mission.
    if (missionData.Current.Remaining.length == missionData.Current.StartingCount) {
      let newestMission = missionData.Current.Remaining.reduce((prev, cur) => (prev.Index > cur.Index) ? prev : cur);
      let newestIndex = missionData.Current.Remaining.indexOf(newestMission);
      missionData.Current.Remaining.splice(newestIndex, 1);
      missionData[newestMission.Rank].Remaining.unshift(newestMission);
      missionData[newestMission.Rank].Remaining.sort((a, b) => a.Index - b.Index);
    }
    
    // Ok, now back to undoing it to Current
    let completedMission = missionData.Completed.Remaining[foundIndex];
    missionData.Completed.Remaining.splice(foundIndex, 1);
    missionData.Current.Remaining.push(completedMission);
    missionData.Current.Remaining.sort((a, b) => a.Index - b.Index);
    
    updateSaveData();
    renderMissions();
  }
}

function bigNum(x) {
  if (x < 1e+6) {
    return x.toLocaleString();
  }
  
  let digits = Math.floor(Math.log10(x));
  let thousands = Math.floor(digits / 3);
  let mantissa = x / Math.pow(10, thousands * 3);
  return `${+mantissa.toFixed(2)} ${POWERS[thousands - 1]}`;
}

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

/* From https://stackoverflow.com/questions/12004808/does-javascript-take-local-decimal-separators-into-account/42213804#42213804 */
function parseLocaleNumber(stringNumber) {
  var thousandSeparator = (1111).toLocaleString().replace(/1/g, '');
  var decimalSeparator = (1.1).toLocaleString().replace(/1/g, '');

  return Number(stringNumber
    .replace(new RegExp('\\' + thousandSeparator, 'g'), '')
    .replace(new RegExp('\\' + decimalSeparator), '.')
  );
}

var generatorsById = null;
function getGenerator(id) {
  if (generatorsById == null) {
    generatorsById = {};
    for (let generator of DATA.Generators) {
      generatorsById[generator.Id] = generator;
    }
  }
  
  return generatorsById[id];
}

var resourcesById = null;
function getResource(id) {
  if (resourcesById == null) {
    resourcesById = {};
    for (let resource of DATA.Resources) {
      resourcesById[resource.Id] = resource;
    }
  }
  
  return resourcesById[id];
}

function resourceName(name) {
  let resource = getResource(name);
  return resource.Plural;
  /* Let's test without for a bit and see how it feels
  if ('StartingQty' in resource) {
    return resource.Plural;
  } else {
    return resource.Singular;
  }
  */
}

function industryName(name) {
  if (name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  } else {
    return "";
  }
}

function describeMission(mission, overrideIcon = "") {
  // TODO: Maybe make this (whole codebase) Object-Oriented at some point?
  let condition = mission.Condition;
  let iconHtml = "";
  let textHtml = "";
  switch (condition.ConditionType) {
    case "TradesSinceSubscription":
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon);
      textHtml =`Trade ${resourceName(condition.ConditionId)} (${condition.Threshold})`;
      break;
    case "ResearchersUpgradedSinceSubscription":
      iconHtml = getMissionIcon("upgrade", condition.ConditionType, overrideIcon);
      textHtml = `Upgrade Cards (${condition.Threshold})`;
      break;
    case "ResourceQuantity":
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon);
      textHtml = `Own ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold).replace(/ /g, '&nbsp;')})`;
      break;
    case "IndustryUnlocked":
      let resourceId = getResourceByIndustry(condition.ConditionId).Id;      
      iconHtml = getMissionIcon(resourceId, condition.ConditionType, overrideIcon);
      textHtml = `Unlock ${resourceName(resourceId)}`;
      break;
    case "ResourcesEarnedSinceSubscription":
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon);
      textHtml = `Collect ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold).replace(/ /g, '&nbsp;')})`;
      break;
    case "ResearcherCardsEarnedSinceSubscription":
      iconHtml = getMissionIcon("card", condition.ConditionType, overrideIcon);
      textHtml = `Collect Cards (${condition.Threshold})`;
      break;
    case "ResourcesSpentSinceSubscription":
      iconHtml = getMissionIcon("darkscience", condition.ConditionType, overrideIcon);
      textHtml = `Spend Dark Science (${condition.Threshold})`;
      break;
    default:
      return `Unknown mission condition: ${condition.ConditionType}`;
  }
  
  return `${iconHtml} ${textHtml}`;
}

function describeReward(reward) {
  if (reward.Reward == "Resources") {
    return `${bigNum(reward.Value)} ${resourceName(reward.RewardId)}`;
  
  } else if (reward.Reward == "Gacha") {
    let gacha = DATA.GachaLootTable.find(g => g.Id == reward.RewardId);
    if (!gacha) { return `Unknown gacha reward id: ${reward.RewardId}`; }
    
    if (gacha.Type == "Scripted") {
      let script = DATA.GachaScripts.find(s => s.GachaId == gacha.Id);
      if (!script) { return `Unknown gacha script id: ${gacha.Id}`; }      
            
      let gold = script.Gold ? `${script.Gold} Gold` : null;
      let science = script.Science ? `${script.Science} <span class="resourceIcon darkscience">&nbsp;</span>` : null;      
      let cards = script.Card.map(card => `${cardValueCount(card)}${describeResearcher(DATA.Researchers.find(r => r.Id == card.Id))}`).join(', ') || null;
      
      let rewards = [gold, science, cards].filter(x => x != null).join('. ');
      
      return `Scripted <span class="capsule ${script.MimicGachaId}">&nbsp;</span>: ${rewards}`;
    } else {
      return `Random <span class="capsule ${reward.RewardId}">&nbsp;</span>`;
    }
    
  } else {    
    return `Unknown reward: ${reward.Reward}`;
  }
}

function describeResearcher(researcher) {
  let details = "";
  let vals, resources;
  switch (researcher.ModType) {
    case "GenManagerAndSpeedMult":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      details = `Speeds up ${resourceName(researcher.TargetIds[0])} by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      break;
    case "TradePayoutMultiplier":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      resources = researcher.TargetIds[0].split(/, ?/).map(res => resourceName(res)).join('/');
      details = `Trading ${resources} grants ${vals[0]}x/${vals[1]}x/${vals[2]}x/... comrades`;
      break;
    case "GeneratorPayoutMultiplier":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      resources = researcher.TargetIds[0].split(/, ?/).map(ind => resourceName(getResourceByIndustry(ind).Id)).join('/');
      details = `Multiplies output of every ${resources}-industry generator by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      break;
    case "GeneratorCritChance":
      vals = [researcher.BasePower + 1 * researcher.CurveModifier + 1 * researcher.UpgradePower,
              researcher.BasePower + 2 * researcher.CurveModifier + 4 * researcher.UpgradePower,
              researcher.BasePower + 3 * researcher.CurveModifier + 9 * researcher.UpgradePower];
      vals = vals.map(v => `${+(v * 100).toFixed(2)}%`);
      resources = researcher.TargetIds[0].split(/, ?/);
      resources = resources.map(ind => resourceName(getResourceByIndustry(ind).Id)).join('/');
      details = `Increases crit chance of every ${resources}-industry generator by ${vals[0]}/${vals[1]}/${vals[2]}/...`;
      break;
    case "GeneratorCostReduction":
      // TODO once I implement Motherland
      break;
    case "GeneratorCritPowerMult":
      // TODO once I implement Motherland
      break;  
    case "GachaCardsPayoutMultiplier":
      // TODO once I implement Motherland
      break;
    case "GachaSciencePayoutMultiplier":
      // TODO once I implement Motherland
      break;
    case "GachaResourcePayoutMultiplier":
      // TODO once I implement Motherland
      break;
    default:
      details = `Unknown researcher ModType "${researcher.ModType}"`;
  }
  return `<a tabindex="0" class="researcherName" role="button" data-toggle="popover" data-placement="top" data-trigger="focus" data-content="${details}">${researcher.Name.replace(/ /g, '&nbsp;')}</a>`;
}

function getResourceByIndustry(industryId) {
  // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
  let industryIndex = DATA.Industries.findIndex(i => i.Id == industryId);
  return DATA.Resources[industryIndex];
}
  
function getIndustryByResource(resourceId) {
  // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
  let resourceIndex = DATA.Resources.findIndex(r => r.Id == resourceId);
  return DATA.Industries[resourceIndex];
}
  
function cardValueCount(card) {
  // Trying to decide between hiding 1x. I think I want it.
  return `${card.Value}x&nbsp;`;
}

var MISSION_EMOJI = {
  TradesSinceSubscription: "&#129309;",
  ResearchersUpgradedSinceSubscription: "&#10548;",
  ResourceQuantity: "&#127960;",
  IndustryUnlocked: "&#128275;",
  ResourcesEarnedSinceSubscription: "&#128200;",
  ResearcherCardsEarnedSinceSubscription: "&#127183;",
  ResourcesSpentSinceSubscription: "&#9879;"
};

function getMissionIcon(resourceId, missionConditionType, overrideIcon = "") {
  let iconConfig = overrideIcon || localStorage.getItem("IconConfig");
  if (iconConfig == "none") {
    return "";
  } else if (iconConfig == "emoji") {
    return MISSION_EMOJI[missionConditionType];
  } else {
    return `<span style="background-image: url('img/${resourceId}.png');" class="resourceIcon">&nbsp;</span>`;
  }
}

function toggleCompleted() {
  let element = document.getElementById('Completed-body');
  if (localStorage.getItem("event-CompletedVisible") == "true") {
    localStorage.setItem("event-CompletedVisible", "false");
    element.style.display = "none";
  } else {
    localStorage.setItem("event-CompletedVisible", "true");
    element.style.display = "block";
  }
}

function setIcons(iconType) {
  localStorage.setItem('IconConfig', iconType);
  $('.config-icon').removeClass('active');
  $(`#config-icon-${iconType}`).addClass('active');
  
  renderMissions();
}

var StylesheetUrls = {
  light: "https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css",
  dark: "https://stackpath.bootstrapcdn.com/bootswatch/4.3.1/cyborg/bootstrap.min.css"
};

function setStyle(styleType) {
  localStorage.setItem('StyleConfig', styleType);
  $('.config-style').removeClass('active');
  $(`#config-style-${styleType}`).addClass('active');
  
  if (styleType in StylesheetUrls) {
    $('#stylesheet').attr('href', StylesheetUrls[styleType]);
  }
}

function advanceProgressTo() {
  /* Maybe do a post-1990 solution to this? */
  let inputRank = prompt("Complete all missions BEFORE which rank?");
  if (inputRank == null || inputRank == "") {
    return;
  }
  
  let rank = parseInt(inputRank);
  if (!rank || rank <= 1 || rank >= DATA.Ranks.length) {
    alert(`Invalid rank: "${inputRank}".`);
  }
  
  // Go through every mission in every rank and move all with Rank < rank to Completed.
  // Start with current, then just the numbered ranks.
  let clearRanks = ["Current", ...Object.keys(missionData).filter(r => r <= rank)];
  for (let clearRank of clearRanks) {  
    let rankData = missionData[clearRank].Remaining;

    for (let clearIndex = 0; clearIndex < rankData.length; clearIndex++) {
      let mission = rankData[clearIndex];
      
      if (mission.Rank < rank) {
        rankData.splice(clearIndex, 1);
        missionData.Completed.Remaining.push(mission);
        clearIndex -= 1;
      }
    }
  }
  
  // Now fill in Current
  for (let fillRank = rank;
        fillRank < DATA.Ranks.length &&
          missionData.Current.Remaining.length < missionData.Current.StartingCount;
        fillRank++) {
    
      let rankData = missionData[fillRank].Remaining;
      for (let fillIndex = 0;
            fillIndex < rankData.length &&
              missionData.Current.Remaining.length < missionData.Current.StartingCount;
            fillIndex++) {
        
        let mission = rankData[fillIndex];
        rankData.splice(fillIndex, 1);
        missionData.Current.Remaining.push(mission);
        fillIndex -= 1;
      }
  }
  
  updateSaveData();
  renderMissions();
}

function resetProgress() {
  /* Maybe do a post-1990 solution to this? */
  if (confirm("Are you sure you want to RESET your mission progress?")) {
    localStorage.removeItem("event-Completed");
    localStorage.removeItem("event-FormValues");
    initializeMissionData();
    renderMissions();
  }
}

function renderCalculator(mission) {
  let condition = mission.Condition;
  let conditionType = condition.ConditionType;
  if (["ResourceQuantity", "IndustryUnlocked", "ResourcesEarnedSinceSubscription"].includes(conditionType)) {
    // First figure out which industry to display and calculate
    let industryId = "";
    if (conditionType == "ResourceQuantity") {
      industryId = getGenerator(condition.ConditionId).IndustryId;
    } else if (conditionType == "IndustryUnlocked") {
      // Choose the industry to the left of the one to unlock.
      let unlockableIndustryIndex = DATA.Industries.findIndex(i => i.Id == condition.ConditionId);
      industryId = DATA.Industries[unlockableIndustryIndex - 1].Id;
    } else if (conditionType == "ResourcesEarnedSinceSubscription") {
      industryId = getIndustryByResource(condition.ConditionId).Id;
    }
    
    // Display comrade inputs, shared inputs, and generator inputs
    let html = `<table class="calcTable"><tr><td class="pr-3"><span class="mt-1 resourceIcon comrades float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="comrades" placeholder="# of Comrades"></span></td><td><span class="mt-1 resourceIcon comradesPerSec float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="comradesPerSec" placeholder="Comrades/second"></span></td></tr>`;
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon power float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="power" placeholder="Power"></span></td><td><span class="mt-1 resourceIcon discount float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="discount" placeholder="Discount"></span></td></tr>`;
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon critChance float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="critChance" placeholder="Crit Chance"></span></td><td><span class="mt-1 resourceIcon critPower float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="critPower" placeholder="Crit Power"></span></td></tr>`;
    
    let generators = DATA.Generators.filter(g => g.IndustryId == industryId);
    for (let generator of generators) {
      let id = generator.Id;
      let name = resourceName(id);
      html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="${id}-count" placeholder="# of ${name}"></span></td><td><span class="mt-1 resourceIcon speed float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="${id}-speed" placeholder="Speed"></span></td></tr>`;
    }
    
    let resource = getResourceByIndustry(industryId);
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${resource.Id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="resources" placeholder="# of ${resourceName(resource.Id)}"></span></td>`;
    if (conditionType == "ResourcesEarnedSinceSubscription") {
      html += `<td><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${resource.Id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="resourceProgress" placeholder="Mission Progress"></span></td></tr>`;
    } else {
      html += "<td></td></tr>";
    }
    html += "</table>";
    
    html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configAutobuy"><label class="form-check-label" for="configAutobuy">Auto-buy highest-tier generator</label></div>`;
    
    if (conditionType == "ResourceQuantity") {
      html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configComradeLimited" onclick="clickComradeLimited('${condition.ConditionId}')"><label class="form-check-label" for="configComradeLimited">Limited by comrades only</label></div>`;
    }
    
    html += `<p><strong>Result:</strong> <span id="result"></span></p>`;
    html += `<input type="hidden" id="missionId" value="${mission.Id}"><input type="hidden" id="industryId" value="${industryId}">`;
    html += `<p><button id="calcButton" class="btn btn-primary" type="button" onclick="doProductionSim()">Calculate!</button></p>`;
    
    return html;
  } else {
    return "Mission type currently unsupported.  Check back next event!";
  }
}

function clickComradeLimited(generatorId) {
  let checked = $('#configComradeLimited').is(':checked');
  $("#calc input[type='text']").not(`#comradesPerSec,#${generatorId}-count`).prop("disabled", checked);
}

function doProductionSim() {
  let simData = getProductionSimDataFromForm();
  
  if (simData.Errors != 0) {
    $('#result').text(`Please fix ${simData.Errors} issue${(simData.Errors > 1)?"s":""}, and Calculate again.`);
    return;
  } else {
    $('#result').text("");
  }
  
  $('#calcButton').attr('disabled', 'true');
  $('#calcButton').addClass('disabled');
  
  let result;
  if (simData.Config.ComradeLimited) {
    result = calcLimitedComrades(simData);
  } else {
    result = simulateProductionMission(simData);
  }
  
  $('#calcButton').removeAttr('disabled');
  $('#calcButton').removeClass('disabled');
  
  if (result == -1) {
    $('#result').text(`ETA: More than 24 hours.`);
  } else {
    /* From https://stackoverflow.com/questions/1322732/convert-seconds-to-hh-mm-ss-with-javascript */
    $('#result').text(`ETA: ${new Date(result * 1000).toISOString().substr(11, 8)}`);
  }
}

function getProductionSimDataFromForm() {
  let industryId = $('#industryId').val();
  let resourceId = getResourceByIndustry(industryId).Id;
  let missionId = $('#missionId').val();
  let mission = DATA.Missions.find(m => m.Id == missionId);
  let generators = DATA.Generators.filter(g => g.IndustryId == industryId);
  
  let simData = { Generators: [], Counts: {}, Mission: mission, IndustryId: industryId, Errors: 0, Config: {} };
  
  // Dig out and parse each number in the form.
  let formValues = {};
  let globalFormValues = {};
  let comrades = getValueFromForm('#comrades', 0, simData, null);
  let comradesPerSec = getValueFromForm('#comradesPerSec', 0, simData, globalFormValues);
  let power = getValueFromForm('#power', 1, simData, formValues);
  let discount = getValueFromForm('#discount', 1, simData, formValues);
  let critChance = getValueFromForm('#critChance', 0, simData, formValues) / 100;
  let critPower = getValueFromForm('#critPower', generators[0].Crit.Multiplier, simData, formValues);
  
  simData.Generators.push({Id: "comradegenerator", Resource: "comrade", QtyPerSec: comradesPerSec, Cost: []});
  simData.Counts["comrade"] = comrades;
  simData.Counts["comradegenerator"] = 1;
    
  for (let generator of generators) {
    let genCount = getValueFromForm(`#${generator.Id}-count`, 0, simData, null);
    let genSpeed = getValueFromForm(`#${generator.Id}-speed`, 0, simData, formValues);
    
    let costs = generator.Cost.map(c => ({ Resource: c.Resource.toLowerCase(), Qty: Number(c.Qty) }));
    
    simData.Generators.push(({
      Id: generator.Id,
      Resource: generator.Generate.Resource,
      QtyPerSec: generator.Generate.Qty / generator.BaseCompletionTime * power * genSpeed * (critChance * critPower + 1 - critChance),      
      Cost: costs
    }));
    
    simData.Counts[generator.Id] = genCount;
  }
  
  let resources = getValueFromForm('#resources', 0, simData, null);
  simData.Counts[resourceId] = resources;

  let resourceProgress = 0;
  if (mission.Condition.ConditionType == "ResourcesEarnedSinceSubscription") {
    resourceProgress = getValueFromForm('#resourceProgress', 0, simData, null);
  }
  simData.Counts["resourceProgress"] = resourceProgress;
  
  simData.Config.Autobuy = $('#configAutobuy').is(':checked');
  simData.Config.ComradeLimited = $('#configComradeLimited').is(':checked');
  
  saveFormValues(formValues, industryId);
  saveFormValues(globalFormValues, "global");
  
  return simData;
}

function getValueFromForm(inputId, defaultValue, simData, formValues) {
  let value = fromBigNum($(inputId).val());
  let result = value || defaultValue;

  if (isNaN(value)) {
    $(inputId).addClass('is-invalid');
    simData.Errors += 1;
  } else {
    $(inputId).removeClass('is-invalid');
    
    if (formValues) {
      formValues[inputId] = result;
    }

    if (value == "") {
      // If the input was empty, fill it in automatically
      $(inputId).val(bigNum(result));
    }
  }
  
  return result;
}

function saveFormValues(formValues, industryId) {
  let allFormValues = {};
  
  let valuesString = localStorage.getItem("event-FormValues");
  if (valuesString) {
    allFormValues = JSON.parse(valuesString);
  }
  
  allFormValues[industryId] = formValues;
  
  localStorage.setItem("event-FormValues", JSON.stringify(allFormValues));
}

function loadFormValues() {
  let valuesString = localStorage.getItem("event-FormValues");
  if (!valuesString) {
    return;
  }
  
  let industryId = $('#industryId').val();
  let formValues = JSON.parse(valuesString);
  
  // combine any values that may exist for the industry or globally
  let industryValues = formValues[industryId] || {};
  let globalValues = formValues["global"] || {};
  let combinedValues = {...industryValues, ...globalValues};
  
  for (let inputId in combinedValues) {
    $(inputId).val(bigNum(combinedValues[inputId]));
  }
}

function calcLimitedComrades(simData) {
  let condition = simData.Mission.Condition;
  
  let generator = simData.Generators.find(g => g.Id == condition.ConditionId);
  let comradeCost = generator.Cost.find(c => c.Resource == "comrade");
  
  let comradeGenerator = simData.Generators[0]; // Assumes the first Generator is for comrades.
  if (!comradeCost || !comradeGenerator || comradeGenerator.QtyPerSec == 0) {
    return -1;
  }
  
  let gensNeeded = condition.Threshold - simData.Counts[condition.ConditionId];
  if (gensNeeded <= 0) {
    return 0;
  } else {
    return gensNeeded * comradeCost.Qty / comradeGenerator.QtyPerSec;
  }
}

function simulateProductionMission(simData) {
  const DELTA_TIME = 0.2;
  const MAX_TIME = 60 * 60 * 24; // 24h
  
  // First, handle autobuy, if enabled.
  let autobuyGenerator = null;
  if (simData.Config.Autobuy) {
    // search backwards through the generators for the first one with >0
    for (let genIndex = simData.Generators.length - 1; genIndex >= 0; genIndex--) {
      if (simData.Counts[simData.Generators[genIndex].Id] > 0) {
        autobuyGenerator = simData.Generators[genIndex];
        break;
      }
    }
  }
  
  // Second, determine the goals, e.g. { Resource: "potato", Qty: 150 }
  let goals = [];
  let condition = simData.Mission.Condition;
  switch(condition.ConditionType) {
    case "ResourcesEarnedSinceSubscription":
      goals = [{ Resource: "resourceProgress", Qty: condition.Threshold }];
      break;
    case "IndustryUnlocked":
      let industry = DATA.Industries.find(i => i.Id == condition.ConditionId);
      goals = [{ Resource: industry.UnlockCostResourceId, Qty: industry.UnlockCostResourceQty }];
      break;
    case "ResourceQuantity":
      // Instead of directly waiting until we get N generators, we figure out the cost difference
      // This allows us not to be forced into autobuying (which actually isn't always better anyway!)
      let gensNeeded = condition.Threshold - simData.Counts[condition.ConditionId];
      for (let cost of simData.Generators.find(g => g.Id == condition.ConditionId).Cost) {
        if (cost.Resource == "comrade") {
          goals.push(({ Resource: "comradeProgress", Qty: cost.Qty * gensNeeded }));
          simData.Counts["comradeProgress"] = simData.Counts["comrade"];
        } else if (cost.Resource == simData.Generators[1].Resource) {
          goals.push(({ Resource: "resourceProgress", Qty: cost.Qty * gensNeeded }));
          simData.Counts["resourceProgress"] = simData.Counts[simData.Generators[1].Resource];
        } else {
          // the generator before it
          goals.push(({ Resource: cost.Resource, Qty: cost.Qty * gensNeeded }));
        }
      }
      //goal = { Resource: condition.ConditionId, Qty: condition.Threshold };
      break;
    default:
      console.log(`Error: Weird situation! Simulating unknown ConditionType=${condition.ConditionType}`);
  }
    
  // Now do the iteration
  let time;
  for (time = 0; time < MAX_TIME && !metGoals(simData, goals); time += DELTA_TIME) {
    // Run each generator, starting from comrades and lowest-tier first.
    for (let genIndex in simData.Generators) {
      let generator = simData.Generators[genIndex];
      simData.Counts[generator.Resource] += simData.Counts[generator.Id] * generator.QtyPerSec * DELTA_TIME;
      
      // index 0 & 1 make comrades & resources, so they also counts toward "comradeProgress" & "resourceProgress"
      if (genIndex == 0) {
        simData.Counts["comradeProgress"] += simData.Counts[generator.Id] * generator.QtyPerSec * DELTA_TIME;
      } else if (genIndex == 1) {
        simData.Counts["resourceProgress"] += simData.Counts[generator.Id] * generator.QtyPerSec * DELTA_TIME;
      }
    }
    
    // After generating, handle autobuying
    if (autobuyGenerator) {
      let buyCount = getBuyCount(simData, autobuyGenerator);
      for (let cost of autobuyGenerator.Cost) {
        simData.Counts[cost.Resource] -= cost.Qty * buyCount;
      }
      simData.Counts[autobuyGenerator.Id] += buyCount;
    }
  }
  
  if (time >= MAX_TIME) {
    return -1;
  } else {
    return time;
  }
}

function metGoals(simData, goals) {
  for (let goal of goals) {
    if (simData.Counts[goal.Resource] < goal.Qty) {
      return false;
    }
  }
  
  return true;
}

// Calculates how many of a given generator can be bought with the current resources
function getBuyCount(simData, generator) {
  let buyCounts = generator.Cost.map(cost => Math.floor(simData.Counts[cost.Resource] / cost.Qty));
  return Math.min(...buyCounts);  
}

main();
