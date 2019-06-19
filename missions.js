var missionData = {};

function main() {
  initializeMissionData();
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

function loadSaveData() {
  // Load configuration first
  let iconConfig = localStorage.getItem("IconConfig") || "image";
  setIcons(iconConfig);
  
  let styleConfig = localStorage.getItem("StyleConfig") || "light";
  setStyle(styleConfig);
  
  // Now load mission progress
  let loadedEventId = localStorage.getItem("event-Id");
  if (loadedEventId != null && loadedEventId != EVENT_ID) {
    // This save is from a previous event, so let's clear our save.
    // TODO: It might be nice to inform the user this just happened besides the log.
    console.log(`Event ${loadedEventId} is outdated.  Clearing save data.`);
    localStorage.removeItem("event-Completed");
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
      
      title = `Current <span class="currentRank ml-4">Rank ${rankTitle}</span>`;
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
      missionHtml += `<span class="my-1 mx-4" style="display: inline-block;">${renderMissionButton(mission, rank)}</span>`;
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
  
  return `<button class="btn ${buttonClass}" style="width:22em" onclick="clickMission('${mission.Id}')" title="${buttonDescription}">${describeMission(mission)}</button>`;
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
  return `${+mantissa.toFixed(2)} ${POWERS[thousands - 2]}`;
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
  if ('StartingQty' in resource) {
    return resource.Plural;
  } else {
    return resource.Singular;
  }
}

function industryName(name) {
  if (name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  } else {
    return "";
  }
}

function describeMission(mission) {
  // TODO: Maybe make this (whole codebase) Object-Oriented at some point?
  let condition = mission.Condition;
  switch (condition.ConditionType) {
    case "TradesSinceSubscription":
      return `${getMissionIcon(condition.ConditionId, condition.ConditionType)} Trade ${resourceName(condition.ConditionId)} (${condition.Threshold})`;
      break;
    case "ResearchersUpgradedSinceSubscription":
      return `${getMissionIcon("upgrade", condition.ConditionType)} Upgrade Cards (${condition.Threshold})`;
      break;
    case "ResourceQuantity":
      return `${getMissionIcon(condition.ConditionId, condition.ConditionType)} Own ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold)})`;
      break;
    case "IndustryUnlocked":
      // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
      let industryIndex = DATA.Industries.findIndex(i => i.Id = condition.ConditionId);
      let resourceId = DATA.Resources[industryIndex].Id;
      return `${getMissionIcon(resourceId, condition.ConditionType)} Unlock ${resourceName(resourceId)}`;
      break;
    case "ResourcesEarnedSinceSubscription":
      return `${getMissionIcon(condition.ConditionId, condition.ConditionType)} Collect ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold)})`;      
      break;
    case "ResearcherCardsEarnedSinceSubscription":
      return `${getMissionIcon("card", condition.ConditionType)} Collect Cards (${condition.Threshold})`;
      break;
    case "ResourcesSpentSinceSubscription":
      return `${getMissionIcon("darkscience", condition.ConditionType)} Spend Dark Science (${condition.Threshold})`;
      break;
    default:
      return `Unknown mission condition: ${condition.ConditionType}`;
  }
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

function getMissionIcon(resourceId, missionConditionType) {
  let iconConfig = localStorage.getItem("IconConfig");
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
    localStorage.removeItem("event-CompletedVisible");
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
  for (let clearRank in missionData) {
    if (clearRank == "Completed") {
      continue;
    }
    
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
      console.log(`starting fillrank ${fillRank} with rankData: ${rankData}. (Current ${missionData.Current.Remaining})`);
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
    initializeMissionData();
    renderMissions();
  }
}


main();
