var missionData = {}; //  The main data structure used to store the current state of missions.
var missionCompletionTimes = {}; // Maps missionId's to when you completed them.  Can be viewed in the info popup of completed missions.
var currentMode = "main"; 
var currentMainRank = 1;
var currentEventTheme = "";  // e.g. "space" or "ninja".  Primarily used to locate icons.

function main() {
  loadModeSettings();
  initializeMissionData();
  initializeInfoPopup();
  loadSaveData();
  renderMissions();
}

// Determines whether the page is in Main or Event mode, based on the url and save state.
// If event, also determines the event (based on the current time and event schedule).
function loadModeSettings() {
  // Parse url for a ?rank=X, where X is "event" or 1-MAX_RANK
  let splitUrl = window.location.href.split('#');
  splitUrl = splitUrl[0].split('?');
  if (splitUrl.length == 2) {
    let arguments = splitUrl[1].split('&');
    for (let arg of arguments) {
      let keyValue = arg.split('=');
      if (keyValue.length == 2 && keyValue[0] == "rank") {
        if (keyValue[1] == "event") {
          localStorage.setItem("CurrentMode", "event");
        } else if (keyValue[1] == "main") {
          localStorage.setItem("CurrentMode", "main");
        } else if (parseInt(keyValue[1])) {
          localStorage.setItem("CurrentMode", "main");
          setLocal("main", "CurrentRank", keyValue[1]);
        }
      }
    }
  }
  
  // Get values from URL params > previous save > defaults.
  currentMode = localStorage.getItem("CurrentMode") || currentMode;
  currentMainRank = parseInt(getLocal("main", "CurrentRank")) || currentMainRank;
  
  $(`#mode-select-main,#mode-select-event`).removeClass("active");
  $(`#mode-select-${currentMode}`).addClass("active");
  
  let title = (currentMode == "main") ? "Motherland Missions" : "Event Missions"
  $('#mode-select-title').text(title);
  $('#mode-select-title').addClass("show");
  
  // Determine DATA.event and EVENT_ID based on the Schedule
  if (currentMode == "event") {
    let now = new Date();
    
    // We append "Z" to EndTime's ISO8601 format to ensure it is interpretted as being GMT (instead of local time).
    let prevEventIndex = SCHEDULE.Schedule.findIndex(event  => new Date(event.EndTime + "Z") < now);
    let curEventIndex = prevEventIndex - 1; // schedule is ordered from newest to oldest.
    
    if (curEventIndex < 0) {
      $('#alertNoSchedule').addClass("show");
    } else {
      EVENT_ID = SCHEDULE.Schedule[curEventIndex].LteId;
      
      let balanceId = SCHEDULE.Schedule[curEventIndex].BalanceId;
      DATA["event"] = DATA[balanceId];
      currentEventTheme = balanceId.split("-")[0]; // get "ninja" from "ninja-bal-1"
    }
  }
}

// Sets up missionData based on game data and your save data.
// This is different for main/event and returns slightly different objects.
function initializeMissionData() {
  // TODO: Make this object-oriented at some point?
  if (currentMode == "main") {
    initializeMainMissionData();
  } else {
    initializeEventMissionData();
  }
}

// e.g., {1: {StartingCount: 3, Remaining: [...]}, 2: {...}, ..., Completed: {...}, Current: {...}}
function initializeEventMissionData() {
  missionCompletionTimes = {};
  missionData = {Completed: {StartingCount: 0, Remaining: []}, Current: {StartingCount: 3, Remaining: []}};
  
  let rank = 0;
  let missionsLeft = 0;
  for (let missionIndex in getData().Missions) {
    if (missionsLeft == 0) {
      rank += 1;
      
      if (rank >= getData().Ranks.length) {
        // I'm not sure how the game presents this, but the stretch goals will be considered of one next rank
        missionsLeft = getData().Missions.length - missionIndex + 2;
      } else {
        missionsLeft = parseInt(getData().Ranks[rank].Missions);
      }
      
      missionData[rank] = {StartingCount: missionsLeft, Remaining: []};
    
      if (rank == 1) {
        // There's extra missions (to have choices)
        let missionsShown = 3;
        if (rank < getData().Ranks.length) {
          missionsShown = parseInt(getData().Ranks[rank].ActiveMissionCount);
        }        
        missionsLeft += (missionsShown - 1);
      }
    }
    
    let mission = getData().Missions[missionIndex];
    mission.Rank = rank;
    mission.Index = parseInt(missionIndex);
    missionData[mission.Rank].Remaining.push(mission);
    
    missionsLeft -= 1;
  }
  
  for (let i = 0; i < 3; i++) {
    // TODO: Refactor if a first rank has 2 or less missions
    missionData.Current.Remaining.push(missionData[1].Remaining.shift());
  }
}

// e.g., {1: {StartingCount: 3, Remaining: [...]}, 2: {...}, ..., Completed: {...}, Current: {...}, OtherRankMissionIds: [...]}
function initializeMainMissionData() {
  missionCompletionTimes = {};
  missionData = {Completed: {StartingCount: 0, Remaining: []}, Current: {StartingCount: 3, Remaining: []}, OtherRankMissionIds: []};
  
  // Assign indices for sorting
  for (let mIndex = 0; mIndex < getData().Missions.length; mIndex++) {
    getData().Missions[mIndex].Index = mIndex;
  }
  
  // Fill in ranks
  for (let rank of getData().Ranks) {
    let rankMissions = getData().Missions.filter(m => m.Rank == rank.Rank);
    missionData[rank.Rank] = {StartingCount: rankMissions.length, Remaining: rankMissions};
  }
  
  for (let i = 0; i < 3; i++) {
    // TODO: Refactor if a first rank has 2 or less missions
    missionData.Current.Remaining.push(missionData[currentMainRank].Remaining.shift());
  }
}

// Manually initializes popups and popovers, since Bootstrap requires it.
function initializeInfoPopup() {
  /* Based on code from https://getbootstrap.com/docs/4.0/components/modal/ */
  $('#infoPopup').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget); // Button that triggered the modal
    let missionId = button.data('mission'); // Extract info from data-* attributes
    if (!missionId) {
      return;
    }
    
    let mission = getData().Missions.find(m => m.Id == missionId);
    
    let modal = $(this);
    modal.find('.modal-title').html(describeMission(mission, "none"));
    modal.find('#infoReward').html(describeReward(mission.Reward));
    modal.find('#calc').html(renderCalculator(mission));
    
    if (missionId in missionCompletionTimes) {
      modal.find('#completionTimeContainer').addClass('show');
      modal.find('#completionTime').text(new Date(missionCompletionTimes[missionId]));
    } else {
      modal.find('#completionTimeContainer').removeClass('show');
    }
    
    $(function () {
      $('[data-toggle="popover"]').popover();
      $('#numberExample').html(`${(1.58).toLocaleString()} AA`);
      loadFormValues();
    });
  });
}

// Loads settings, and then save data, editing missionData in-place differently for main/events.
function loadSaveData() {
  // Load configuration first
  let iconConfig = localStorage.getItem("IconConfig") || "image";
  setIcons(iconConfig, false);
  
  let styleConfig = localStorage.getItem("StyleConfig") || "light";
  setStyle(styleConfig);
  
  setListStyle(isListActive(), false);
  
  if (getLocal(currentMode, "CompletedVisible") == null) {
    let isNewSave = (getLocal(currentMode, "Completed") == null);
    setLocal(currentMode, "CompletedVisible", isNewSave.toString());  // New saves start open
  }
  
  if (currentMode == "event") {
    loadEventSaveData();
  } else {
    loadMainSaveData();
  }
  
  // Finally load up the completion time data
  missionCompletionTimes = {};
  let loadedCompletionTimes = getLocal(currentMode, "CompletionTimes");
  if (loadedCompletionTimes != null) {
    let completionTimesHash = JSON.parse(loadedCompletionTimes);
    for (let missionId in completionTimesHash) {
      missionCompletionTimes[missionId] = parseInt(completionTimesHash[missionId]);
    }
  }
}

function loadEventSaveData() {  
  // Show permanent alert when DATA.event is unconfirmed
  if (!IS_DATA_FINAL) {
    $('#alertUnconfirmed').addClass('show');
  }
  
  // Now load mission progress
  let loadedEventId = getLocal("event", "Id");
  let loadedEventVersion = getLocal("event", "Version");
  if ((loadedEventId != null && loadedEventId != EVENT_ID) ||
       (loadedEventVersion != null && loadedEventVersion != EVENT_VERSION)) {
    // This save is from a previous event, so let's clear our save.
    // TODO: It might be nice to inform the user this just happened besides the log.
    console.log(`Event ${loadedEventId} version ${loadedEventVersion} is outdated.  Clearing save data.`);
    removeLocal("event", "Completed");
    removeLocal("event", "FormValues");
    removeLocal("event", "CompletionTimes");
    setLocal("event", "Id", EVENT_ID);
    setLocal("event", "Version", EVENT_VERSION);
    $('#alertReset').addClass('show');
    
  } else {
    let dataString = getLocal("event", "Completed");
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
      for (let rank = 1; rank <= getData().Ranks.length; rank++) {
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

function loadMainSaveData() {
  let dataString = getLocal("main", "Completed");
  if (!dataString) {
    return;
  }
  
  let completedIds = dataString.split(',');
  let curRankMissions = new Set(getData().Missions.filter(m => m.Rank == currentMainRank).map(m => m.Id));
  for (let completedId of completedIds) {
    if (curRankMissions.has(completedId)) {
      // This is in the rank we care about
      let missionIndex = missionData.Current.Remaining.findIndex(m => m.Id == completedId);
      
      if (missionIndex != -1) {
        // Take the mission from Current
        let mission = missionData.Current.Remaining.splice(missionIndex, 1)[0];
        missionData.Completed.Remaining.push(mission);
      } else {
        // Or take it from the currentMainRank
        missionIndex = missionData[currentMainRank].Remaining.findIndex(m => m.Id == completedId);
        let mission = missionData[currentMainRank].Remaining.splice(missionIndex, 1)[0];
        missionData.Completed.Remaining.push(mission);
      }
    } else {
      // This is another rank
      missionData.OtherRankMissionIds.push(completedId);
    }
  }
  
  while (missionData.Current.Remaining.length < missionData.Current.StartingCount && missionData[currentMainRank].Remaining.length > 0) {
    let mission = missionData[currentMainRank].Remaining.shift();
    missionData.Current.Remaining.push(mission);
  }
}

// Makes a local save of data so you can refresh/switch page.
// Typically called after you make changes to missionData.
function updateSaveData() {
  if (currentMode == "event") {
    let saveData = missionData.Completed.Remaining.map(m => m.Id).join(',');
    setLocal("event", "Completed", saveData);
    setLocal("event", "Id", EVENT_ID);
    setLocal("event", "Version", EVENT_VERSION);
  } else {
    
    // Motherland
    let curRankCompletedIds = missionData.Completed.Remaining.map(m => m.Id);
    let saveData = [...curRankCompletedIds, ...missionData.OtherRankMissionIds].join(',');
    setLocal("main", "Completed", saveData);
  }
  
  setLocal(currentMode, "CompletionTimes", JSON.stringify(missionCompletionTimes));
}

// Updates the html of the page with all the mission data (i.e., rank boxes with mission buttons).
function renderMissions() {
  if (isListActive()) {
    // A bit of a hack.  List-mode does its own thing.
    renderListStyleMissions();
    return;
  }
  
  let missionHtml = "";
  
  let eventScheduleInfo;  
  let sortedRanks;
  if (currentMode == "event") {
    eventScheduleInfo = SCHEDULE.Schedule.find(s => s.LteId == EVENT_ID);
    
    sortedRanks = Object.keys(missionData);
    sortedRanks.splice(sortedRanks.indexOf("Completed"), 1);
    sortedRanks.splice(sortedRanks.indexOf("Current"), 1);
    sortedRanks.unshift("Current");
    sortedRanks.unshift("Completed");
  } else {
    sortedRanks = ["Completed", "Current", currentMainRank];
  }
  
  
  for (let rank of sortedRanks) {
    if (missionData[rank].Remaining.length == 0 && currentMode == "event" && rank != 'Completed') {
      continue;
    }
    
    let title;
    let bodyStyle = "";
    if (rank == "Completed") {
      let checked = "";
      if (getLocal(currentMode, "CompletedVisible") == "true") {
        checked = "checked";
      } else {        
        bodyStyle = "style='display: none;'";
      }
      title = `${rank} <label class="switch float-right"><input type="checkbox" ${checked} onclick="toggleCompleted()"><span class="slider round"></span>`;
    } else if (rank == "Current") {
      // Find lowest rank with a remaining mission.
      let rankTitle = "Complete!";
      
      if (currentMode == "event") {
        rankTitle = getEventCurrentRankTitle();
      } else {
        // Motherland
        let missingCount = missionData[currentMainRank].StartingCount - missionData[currentMainRank].Remaining.length - missionData.Current.Remaining.length;
        rankTitle = `${currentMainRank} (${missingCount}/${missionData[currentMainRank].StartingCount})`;
      }
      
      title = `Current <span class="currentRank float-right">Rank ${rankTitle}</span>`;
    } else if (currentMode == "main") {
      // A generic MAIN rank
      let buttonsHtml = "";
      
      if (currentMainRank > 1) {
        buttonsHtml += `<a href="?rank=${currentMainRank - 1}" type="button" class="btn btn-outline-secondary" title="Go back to Rank ${currentMainRank - 1}">&larr;</button>`;
      }
      
      buttonsHtml += `<a type="button" class="btn btn-outline-secondary" onclick="selectNewRank()" title="Jump to specific Rank">#</a>`;
      
      if (currentMainRank < DATA.main.Ranks.length) {
        buttonsHtml += `<a href="?rank=${currentMainRank + 1}" type="button" class="btn btn-outline-secondary" title="Go forward to Rank ${currentMainRank + 1}">&rarr;</a>`;
      }
      
      title = `Rank ${rank}<span class="float-right btn-group" role="group">${buttonsHtml}</span>`;
    } else {
      // A generic EVENT rank
      let rankReward = eventScheduleInfo.Rewards[rank - 1];
      let popupHtml = rankReward ? `<strong>Completion Reward:</strong><br />${describeScheduleRankReward(rankReward)}` : "";
      
      let rankResearchers = getData().Researchers.filter(r => r.PlayerRankUnlock == rank);
      if (rankResearchers.length > 0) {
        let rankResearcherDescriptions = rankResearchers.map(r => `${r.Name}: <em>${getResearcherDetails(r)}</em>`);
        let rankResearcherText = `<strong>New Researchers:</strong><br />${rankResearcherDescriptions.join("<br /><br />")}`;
        popupHtml += `${popupHtml ? "<hr />" : ""}${rankResearcherText}`;
      }
      
      if (popupHtml) {
        title = `Rank ${rank} <a class="btn btn-link infoButton float-right" tabindex="-1" role="button" data-toggle="popover" data-placement="left" data-trigger="focus" data-title="Rank ${rank}" data-content="${popupHtml}" data-html="true">&#9432;</a>`;
      } else {
        title = `Rank ${rank}`;
      }
    }
    
    missionHtml += `<div class='card mx-2 mt-1'><h4 class="card-header">${title}</h4><div id="${rank}-body" class="card-body" ${bodyStyle}>`;
    
    if (rank == "Completed" && missionData.Completed.Remaining.length == 0) {
      missionHtml += `<ul><li class="my-1">Click <strong>Current</strong> missions to move them to Completed.</li>`;
      missionHtml += `<li class="my-1">Click <strong>Completed</strong> missions to move them back to Current.</li>`;
      missionHtml += `<li class="my-1">Click this tab's toggle in the top-right to hide Completed missions.</li>`;
      missionHtml += `<li class="my-1">Got questions?  Check out the <a href="https://docs.google.com/document/d/1a314ZQM1f4ggFCtsC__Nb3B_1Hrc02cS0ZhY7_T08v8/">Game Guide/FAQ</a>, <a href="https://discord.gg/VPa4WTM">Discord</a>, or <a href="https://reddit.com/r/AdventureCommunist/">Reddit</a>.</li></ul>`;
    }
    
    if (currentMode == "main" && rank == currentMainRank && missionData[rank].Remaining.length == 0 && missionData.Current.Remaining.length == 0) {
      // In the main mode, when you run out of missions, give a helpful message.
      missionHtml += `<ul><li>Congratulations on completing all missions in Rank ${rank}!</li><li>To go to the next rank, click the &rarr; button in the corner.</li></ul>`;
    } else {
      // Display all missions inside of the rank
      for (let mission of missionData[rank].Remaining) {
        missionHtml += `<span class="missionContainer">${renderMissionButton(mission, rank)}</span>`;
      }
    }
    missionHtml += "</div></div>";
  }
  
  document.getElementById('missions').innerHTML = missionHtml;
  
  // enable popovers
  $(function () {
    $('[data-toggle="popover"]').popover();
  });
}

function renderListStyleMissions() {
  let missionHtml = "<div class='mx-2'>\n";
  
  let ranksToShow = [];
  if (currentMode == "main") {
    ranksToShow = getData().Ranks.filter(r => r.Rank == currentMainRank);
    if (currentMainRank > 1) {
      missionHtml += `<a href="?rank=${currentMainRank - 1}" type="button" class="btn btn-outline-secondary" title="Go back to Rank ${currentMainRank - 1}">&larr;</button>`;
    }
    
    missionHtml += `<a type="button" class="btn btn-outline-secondary" onclick="selectNewRank()" title="Jump to specific Rank">#</a>`;
    
    if (currentMainRank < DATA.main.Ranks.length) {
      missionHtml += `<a href="?rank=${currentMainRank + 1}" type="button" class="btn btn-outline-secondary" title="Go forward to Rank ${currentMainRank + 1}">&rarr;</a>`;
    }
    
    missionHtml += "<br />";
  } else {
    ranksToShow = getData().Ranks;
  }
  
  for (let rank of ranksToShow) {
    missionHtml += `Rank ${rank.Rank}\n<ul>\n`;
    
    let rankMissions = getData().Missions.filter(m => m.Rank == rank.Rank);
    for (let mission of rankMissions) {
      missionHtml += `<li>${describeMission(mission)}</li>\n`;
    }
    
    missionHtml += "</ul>\n";
  }
  
  missionHtml += "</div>";
  document.getElementById('missions').innerHTML = missionHtml;
}

var eventRankTitles = null;
function getEventCurrentRankTitle() {
  if (eventRankTitles == null) {
    // Generate titles based on Completed count
    eventRankTitles = [];
    for (let rank = 1; rank <= getData().Ranks.length; rank++) {
      for (let i = 0; i < missionData[rank].StartingCount; i++) {
        eventRankTitles.push(`${rank} (${i}/${missionData[rank].StartingCount})`);
      }
    }
  }
  
  return eventRankTitles[missionData.Completed.Remaining.length];
}

function describeScheduleRankReward(reward) {
  let upperReward = upperCaseFirstLetter(reward.RewardId);
  switch (reward.Reward) {
    case "Resources":
      if (upperReward == "Scientist") { upperReward = "Science"; }
      return `${reward.Value} ${upperReward}`;
      break;
      
    case "Gacha":
      return `${upperReward} capsule.`;
      break;
      
    case "Researcher":
      return `${reward.Value} ${upperReward} researchers.`;
      break;
  }
}

// Given a root.Missions object, returns an html string of a mission button
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
  
  let infoClass = hasScriptedReward(mission) ? "scriptedRewardInfo" : ""; 
  
  return `<button class="btn ${buttonClass}" onclick="clickMission('${mission.Id}')" title="${buttonDescription}">${describeMission(mission)}</button><a href="#" class="btn btn-link infoButton ${infoClass}" data-toggle="modal" data-target="#infoPopup" data-mission="${mission.Id}" title="Click for mission info/calc">&#9432;</a>`;
}

var scriptedRewardIds = null;
function hasScriptedReward(mission) {
  if (scriptedRewardIds == null) {
    // Build a cache of scripted gacha ids
    scriptedRewardIds = new Set(getData().GachaScripts.map(gs => gs.GachaId));
  }
  
  return scriptedRewardIds.has(mission.Reward.RewardId);
}

// Called OnClick for mission buttons.  Tries to (un)complete if possible.
function clickMission(missionId) {
  let foundIndex;
  if (-1 != (foundIndex = missionData.Current.Remaining.findIndex(m => m.Id == missionId))) {
    // Clicked a Current mission, finish it
    let mission = missionData.Current.Remaining[foundIndex];
    missionData.Current.Remaining.splice(foundIndex, 1);
    missionData.Completed.Remaining.push(mission);
    
    // Find a new mission to replace it with
    if (currentMode == "event") {
      for (let rank = 1; rank <= getData().Ranks.length; rank++) {
        if (missionData[rank].Remaining.length > 0) {
          let newMission = missionData[rank].Remaining.shift();
          missionData.Current.Remaining.push(newMission);
          break;
        }
      }
    } else {
      // Motherland
      if (missionData[currentMainRank].Remaining.length > 0) {
        let newMission = missionData[currentMainRank].Remaining.shift();
        missionData.Current.Remaining.push(newMission);
      }
    }
    
    missionCompletionTimes[missionId] = (new Date()).getTime();
    
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
    
    if (missionId in missionCompletionTimes) {
      delete missionCompletionTimes[missionId];
    }
    
    updateSaveData();
    renderMissions();
  }
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
    for (let generator of getData().Generators) {
      generatorsById[generator.Id] = generator;
    }
  }
  
  return generatorsById[id];
}

var resourcesById = null;
function getResource(id) {
  if (resourcesById == null) {
    resourcesById = {};
    for (let resource of getData().Resources) {
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
  upperCaseFirstLetter(name);
}

function upperCaseFirstLetter(name) {
  if (name) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  } else {
    return "";
  }
}

// Given a mission object, returns a description html string that idenitifies the mission.
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
      iconHtml = getMissionIcon("upgrade", condition.ConditionType, overrideIcon, "shared");
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
      iconHtml = getMissionIcon("card", condition.ConditionType, overrideIcon, "shared");
      textHtml = `Collect Cards (${condition.Threshold})`;
      break;
    case "ResourcesSpentSinceSubscription":
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon, 'event');
      textHtml = `Spend ${resourceName(condition.ConditionId)} (${condition.Threshold})`;
      break;
    default:
      return `Unknown mission condition: ${condition.ConditionType}`;
  }
  
  return `${iconHtml} ${textHtml}`;
}

// Given a root.Missions.Reward object, return an html string describing the reward (almost always a gacha capsule with gold + science + researchers).
function describeReward(reward) {
  if (reward.Reward == "Resources") {
    return `${bigNum(reward.Value)} ${resourceName(reward.RewardId)}`;
  
  } else if (reward.Reward == "Gacha") {
    let gacha = getData().GachaLootTable.find(g => g.Id == reward.RewardId);
    if (!gacha) { return `Unknown gacha reward id: ${reward.RewardId}`; }
    
    if (gacha.Type == "Scripted") {
      let script = getData().GachaScripts.find(s => s.GachaId == gacha.Id);
      if (!script) { return `Unknown gacha script id: ${gacha.Id}`; }      
            
      let gold = script.Gold ? `${script.Gold} Gold` : null;
      let science = script.Science ? `${script.Science} <span class="resourceIcon darkscience">&nbsp;</span>` : null;      
      let cards = script.Card.map(card => `${cardValueCount(card)}${describeResearcher(getData().Researchers.find(r => r.Id == card.Id))}`).join(', ') || null;
      
      let rewards = [gold, science, cards].filter(x => x != null).join('. ');
      
      return `Scripted <span class="capsule ${script.MimicGachaId}">&nbsp;</span>: ${rewards}`;
    } else {
      return `Random <span class="capsule ${reward.RewardId}">&nbsp;</span>`;
    }
    
  } else {    
    return `Unknown reward: ${reward.Reward}`;
  }
}

// Given a root.Researchers object, returns an html string with a clickable version of their name with a popover description.
function describeResearcher(researcher) {
  let details = getResearcherDetails(researcher);
  return `<a tabindex="0" class="researcherName" role="button" data-toggle="popover" data-placement="top" data-trigger="focus" data-content="${details}">${researcher.Name.replace(/ /g, '&nbsp;')}</a>`;
}

// Given a root.Researchers object, returns a description of that researcher's effect.
function getResearcherDetails(researcher) {
  let vals, resources;
  switch (researcher.ModType) {
    case "GenManagerAndSpeedMult":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      return `Speeds up ${resourceName(researcher.TargetIds[0])} by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      break;
      
    case "TradePayoutMultiplier":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      resources = researcher.TargetIds[0].split(/, ?/).map(res => resourceName(res));
      if (resources.length == getData().Industries.length) {
        return `All trades grant ${vals[0]}x/${vals[1]}x/${vals[2]}x/... comrades`;
      } else {
        return `Trading ${resources.join('/')} grants ${vals[0]}x/${vals[1]}x/${vals[2]}x/... comrades`;
      }
      break;
      
    case "GeneratorPayoutMultiplier":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      // This is either a multiplier to a single generator (like "Farmer") or a set of industries ("Farming,Landwork,Mining")
      resources = getData().Resources.find(r => r.Id == researcher.TargetIds[0].toLowerCase());
      if (resources) {
        return `Multiplies output of ${resourceName(resources.Id)} by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      } else {
        resources = researcher.TargetIds[0].split(/, ?/).map(ind => resourceName(getResourceByIndustry(ind).Id));
        if (resources.length == getData().Industries.length) {
          return `Multiplies output of all generators by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
        } else {
          return `Multiplies output of every ${resources.join('/')}-industry generator by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
        }
      }
      break;
      
    case "GeneratorCritChance":
      vals = [researcher.BasePower + 1 * researcher.CurveModifier + 1 * researcher.UpgradePower,
              researcher.BasePower + 2 * researcher.CurveModifier + 4 * researcher.UpgradePower,
              researcher.BasePower + 3 * researcher.CurveModifier + 9 * researcher.UpgradePower];
      vals = vals.map(v => `${+(v * 100).toFixed(2)}%`);
      resources = researcher.TargetIds[0].split(/, ?/);
      if (resources.length == getData().Industries.length) {
        return `Increases crit chance of all generators by ${vals[0]}/${vals[1]}/${vals[2]}/...`;
      } else {
        resources = resources.map(ind => resourceName(getResourceByIndustry(ind).Id)).join('/');
        return `Increases crit chance of every ${resources}-industry generator by ${vals[0]}/${vals[1]}/${vals[2]}/...`;
      }
      break;
      
    case "GeneratorCostReduction":
      // TODO once I implement Motherland
    case "GeneratorCritPowerMult":
      // TODO once I implement Motherland
    case "GachaCardsPayoutMultiplier":
      // TODO once I implement Motherland
    case "GachaSciencePayoutMultiplier":
      // TODO once I implement Motherland
    case "GachaResourcePayoutMultiplier":
      // TODO once I implement Motherland
    default:
      return `Unknown researcher ModType ${researcher.ModType}`;
  }
}

// Given an industryId (e.g., 'big farma'), returns the associated root.Resources object (e.g., placebo).
function getResourceByIndustry(industryId) {
  // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
  industryId = industryId.toLowerCase();
  let industryIndex = getData().Industries.findIndex(i => i.Id == industryId);
  return getData().Resources[industryIndex];
}

// Given a resourceId (e.g., 'placebo'), returns the associated root.Industries object (e.g., Big Farma).
function getIndustryByResource(resourceId) {
  // This is a bit of a hack, and assumes that the first N Resources represent the N Industries.  This currently happens to be correct in every balance.json.
  let resourceIndex = getData().Resources.findIndex(r => r.Id == resourceId);
  return getData().Industries[resourceIndex];
}
  
// Given a root.GachaScripts.Card element, return a string describing how many copies you would get (e.g., '15x ')
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

// Used in describeMission to get an approriate icon based on the settings and resource involved.
function getMissionIcon(resourceId, missionConditionType, overrideIcon = "", overrideDirectory = "") {
  let imgDirectory;
  if (overrideDirectory) {
    imgDirectory = overrideDirectory;
  } else if (currentEventTheme) {
    imgDirectory = `${currentMode}/${currentEventTheme}`;
  } else {
    imgDirectory = `${currentMode}`;
  }
  
  let iconConfig = overrideIcon || localStorage.getItem("IconConfig");
  if (iconConfig == "none") {
    return "";
  } else if (iconConfig == "emoji") {
    return MISSION_EMOJI[missionConditionType];
  } else {
    return `<span style="background-image: url('img/${imgDirectory}/${resourceId}.png');" class="resourceIcon">&nbsp;</span>`;
  }
}

// Run OnClick for the big visibility toggle of Completed.
function toggleCompleted() {
  let element = document.getElementById('Completed-body');
  if (getLocal(currentMode, "CompletedVisible") == "true") {
    setLocal(currentMode, "CompletedVisible", "false");
    element.style.display = "none";
  } else {
    setLocal(currentMode, "CompletedVisible", "true");
    element.style.display = "block";
  }
}

// Run whenever the icon setting changes (OnClick) or is initialized.
function setIcons(iconType, shouldRenderMissions = true) {
  localStorage.setItem('IconConfig', iconType);
  $('.config-icon').removeClass('active');
  $(`#config-icon-${iconType}`).addClass('active');
  
  if (shouldRenderMissions) {
    renderMissions();
  }
}

var StylesheetUrls = {
  light: "https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css",
  dark: "https://stackpath.bootstrapcdn.com/bootswatch/4.3.1/cyborg/bootstrap.min.css"
};

// Run whenever the style setting changes (OnClick) or is initialized.
function setStyle(styleType) {
  localStorage.setItem('StyleConfig', styleType);
  $('.config-style').removeClass('active');
  $(`#config-style-${styleType}`).addClass('active');
  
  if (styleType in StylesheetUrls) {
    $('#stylesheet').attr('href', StylesheetUrls[styleType]);
    
    let styleIds = Object.keys(StylesheetUrls).join(" ");
    $('#body').removeClass(styleIds).addClass(styleType);
  }  
}

// Run OnClick for the list style option.
function toggleListStyle() {
  let currentListStyle = localStorage.getItem('ListStyleActiveConfig');
  setListStyle(!(currentListStyle == "true"));
}

// Run whenever the list style option changes (OnClick) or is initialized.
function setListStyle(isListActive, shouldRenderMissions = true) {
  localStorage.setItem('ListStyleActiveConfig', isListActive);
  
  if (isListActive) {
    $('#config-style-list').addClass('active');
  } else {
    $('#config-style-list').removeClass('active');
  }
  
  if (shouldRenderMissions) {
    renderMissions();
  }
}

function isListActive() {
  return (localStorage.getItem('ListStyleActiveConfig') == "true");
}

// Prompts the user for a rank and attempts to advance their progress to that rank.
// For main, this is identical to the "#" button and just switches your current rank setting.
// For events, it auto-completes all missions prior to the rank.
function advanceProgressTo() {
  /* Maybe do a post-1990 solution to this? */
  if (currentMode == "main") {
    selectNewRank();
    return;
  }
  
  // Little more complicated for Events...
  let inputRank = prompt("Complete all missions BEFORE which rank?");
  if (inputRank == null || inputRank == "") {
    return;
  }
  
  let rank = parseInt(inputRank);
  if (!rank || rank <= 1 || rank > getData().Ranks.length) {
    alert(`Invalid rank: "${inputRank}".`);
    return;
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
        fillRank < getData().Ranks.length &&
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
    removeLocal(currentMode, "Completed");
    removeLocal(currentMode, "FormValues");
    removeLocal(currentMode, "CompletionTimes");
    initializeMissionData();
    renderMissions();
  }
}

// Used by the "#" button and advanceProgressTo to redirect you to a main rank's page if appropriate.
function selectNewRank() {
  /* TODO: Post-1990 solution blah blah */
  let inputRank = prompt("Jump to which rank?");
  if (inputRank == null || inputRank == "") {
    return;
  }
  
  let rank = parseInt(inputRank);
  if (!rank || rank < 1 || rank >= getData().Ranks.length) {
    alert(`Invalid rank: "${inputRank}".`);
    return;
  }
  
  let splitUrl = window.location.href.split('?');
  window.location.assign(`${splitUrl[0]}?rank=${rank}`);
}


// getLocal, setLocal and removeLocal is a layer of abstraction that creates a key name based on the mode and given key.
function getLocal(mode, key) {
  return localStorage.getItem(`${mode}-${key}`);
}

function setLocal(mode, key, value) {
  localStorage.setItem(`${mode}-${key}`, value);
}

function removeLocal(mode, key) {
  localStorage.removeItem(`${mode}-${key}`);
}


function getData() {
  return DATA[currentMode];
}


/******* CALCULATOR STUFF ******/

// Given a root.Missions object, returns an html string representing the calculator (most of the mission popup content).
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
      let unlockableIndustryIndex = getData().Industries.findIndex(i => i.Id == condition.ConditionId);
      industryId = getData().Industries[unlockableIndustryIndex - 1].Id;
    } else if (conditionType == "ResourcesEarnedSinceSubscription") {
      if (condition.ConditionId.toLowerCase() == "scientist") {
        // We currently don't support a calculator collecting science
        return "Mission type currently unsupported.  Check back next event!";
      }
      
      industryId = getIndustryByResource(condition.ConditionId).Id;
    }
    
    // Display comrade inputs, shared inputs, and generator inputs
    let html = `<table class="calcTable"><tr><td class="pr-3"><span class="mt-1 resourceIcon comrades float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="comrades" placeholder="# of Comrades"></span></td><td><span class="mt-1 resourceIcon comradesPerSec float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="comradesPerSec" placeholder="Comrades/second"></span></td></tr>`;
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon power float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="power" placeholder="Power"></span></td><td><span class="mt-1 resourceIcon discount float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="discount" placeholder="Discount"></span></td></tr>`;
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon critChance float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="critChance" placeholder="Crit Chance"></span></td><td><span class="mt-1 resourceIcon critPower float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="critPower" placeholder="Crit Power"></span></td></tr>`;
    
    let generators = getData().Generators.filter(g => g.IndustryId == industryId);
    for (let generator of generators) {
      let id = generator.Id;
      let name = resourceName(id);
      html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${currentMode}/${id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="${id}-count" placeholder="# of ${name}"></span></td><td><span class="mt-1 resourceIcon speed float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="${id}-speed" placeholder="Speed"></span></td></tr>`;
      
      // Band-aid fix for tier-1 power rares in the motherland
      if (currentMode == "main" && id == generators[0].Id) {
        html += `<tr><td>&nbsp;</td><td><span class="mt-1 resourceIcon power float-left mr-2">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="${id}-power" placeholder="Power"></span></td></tr>`;
      }
    }
    
    let resource = getResourceByIndustry(industryId);
    html += `<tr><td class="pr-3"><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${currentMode}/${resource.Id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="resources" placeholder="# of ${resourceName(resource.Id)}"></span></td>`;
    if (conditionType == "ResourcesEarnedSinceSubscription") {
      html += `<td><span class="mt-1 resourceIcon float-left mr-2" style="background-image: url('img/${currentMode}/${resource.Id}.png');">&nbsp;</span><span class="calcInputContainer"><input type="text" class="form-control" id="resourceProgress" placeholder="Mission Progress"></span></td></tr>`;
    } else {
      html += "<td></td></tr>";
    }
    html += "</table>";
    
    html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configAutobuy"><label class="form-check-label" for="configAutobuy">Auto-buy highest-tier generator</label></div>`;
    
    if (conditionType == "ResourceQuantity") {
      html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configComradeLimited" onclick="clickComradeLimited('${condition.ConditionId}')"><label class="form-check-label" for="configComradeLimited">Limited by comrades only</label></div>`;
    }
    
    html += `<div class="form-inline"><label for="configMaxDays" class="mr-2">Max Days:</label><input type="number" class="form-control w-25" min="1" value="1" id="configMaxDays" placeholder="Max Days"> 
    <a class="btn btn-link infoButton" tabindex="-1" role="button" data-toggle="popover" data-trigger="focus" data-content="Higher Max Days allows you to simulate further, but increases time when simulation doesn't succeed.">&#9432;</a></div>`;
    
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
  $("#calc input[type='text'],input[type='number']").not(`#comradesPerSec,#${generatorId}-count`).prop("disabled", checked);
}

// Called OnClick for "Calculate!"  Interprets input, runs calc/sim, and outputs result.
function doProductionSim() {
  let simData = getProductionSimDataFromForm();
  
  if (simData.Errors != 0) {
    $('#result').text(`Please fix ${simData.Errors} issue${(simData.Errors > 1)?"s":""}, and Calculate again.`);
    $('#result').effect('highlight', {}, 2000);
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
    $('#result').text(`ETA: More than ${simData.Config.MaxDays} days. Increase max day limit.`);
  } else {
    /* From https://stackoverflow.com/questions/1322732/convert-seconds-to-hh-mm-ss-with-javascript */
    let days = Math.floor(result / (60 * 60 * 24));
    let [hours, minutes, seconds] = new Date(result * 1000).toISOString().substr(11, 8).split(':');
    
    let eta = '';
    if (days > 0) {
      eta = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      eta = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      eta = `${minutes}m ${seconds}s`;
    } else {
      eta = `${seconds}s`;
    }
    
    $('#result').text(`ETA: ${eta}`);
  }
  
  $('#result').effect('highlight', {}, 2000);
}

function getProductionSimDataFromForm() {
  let industryId = $('#industryId').val();
  let resourceId = getResourceByIndustry(industryId).Id;
  let missionId = $('#missionId').val();
  let mission = getData().Missions.find(m => m.Id == missionId);
  let generators = getData().Generators.filter(g => g.IndustryId == industryId);
  
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
    
    // A band-aid fix until I properly overhaul the calc
    let genPower = 1;
    if (currentMode == "main" && generator.Id == generators[0].Id) {
      genPower = getValueFromForm(`#${generator.Id}-power`, 1, simData, formValues);
    }
    
    let costs = generator.Cost.map(c => ({ Resource: c.Resource.toLowerCase(), Qty: Number(c.Qty) }));
    for (let cost of costs) {
      if (cost.Resource != "comrade") {
        cost.Qty /= discount;
      }
    }
    
    simData.Generators.push(({
      Id: generator.Id,
      Resource: generator.Generate.Resource,
      QtyPerSec: generator.Generate.Qty / generator.BaseCompletionTime * power * genPower * genSpeed * (critChance * critPower + 1 - critChance),
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
  simData.Config.MaxDays = getValueFromForm('#configMaxDays', 1, simData, formValues);
  
  saveFormValues(formValues, industryId);
  saveFormValues(globalFormValues, "global");
  
  return simData;
}

// Gets a value from the form (with error checking) and optionally stores that value.
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
  
  let valuesString = getLocal(currentMode, "FormValues");
  if (valuesString) {
    allFormValues = JSON.parse(valuesString);
  }
  
  allFormValues[industryId] = formValues;
  
  setLocal(currentMode, "FormValues", JSON.stringify(allFormValues));
}

// Loads the saved form values and inputs them onto the form.
function loadFormValues() {
  let industryId = $('#industryId').val();
  let formValues = getFormValuesObject();
  
  // combine any values that may exist for the industry or globally
  let industryValues = formValues[industryId] || {};
  let globalValues = formValues["global"] || {};
  let combinedValues = mergeObjects(industryValues, globalValues);
  
  for (let inputId in combinedValues) {
    $(inputId).val(bigNum(combinedValues[inputId]));
  }
}

// Returns a new object that is the union of two objects
function mergeObjects(left, right) {
  if (Object.assign) {
    return Object.assign({}, left, right);
    
  } else {
    let result = {};
    for (let key in left) { result[key] = left[key]; }
    for (let key in right) { result[key] = right[key]; }
    
    return result;
  }
}

// Returns an object representing saved form information
function getFormValuesObject() {
  let valuesString = getLocal(currentMode, "FormValues");
  if (!valuesString) {
    return {};
  }
  
  try {
    return JSON.parse(valuesString);
  } catch (err) {
    return {};
  }
}

//  We don't need to do a simulation in this case, since it's a trivial O(1) calculation.
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

// The core "simulation."  Returns seconds until goal is met, or -1 if goal is not met in MaxDays.
function simulateProductionMission(simData, deltaTime = 1.0) {
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
      let industry = getData().Industries.find(i => i.Id == condition.ConditionId);
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
  let maxTime = simData.Config.MaxDays * 24 * 60 * 60; // convert max days to max seconds
  let time;
  for (time = 0; time < maxTime && !metGoals(simData, goals); time += deltaTime) {
    // Run each generator, starting from comrades and lowest-tier first.
    for (let genIndex in simData.Generators) {
      let generator = simData.Generators[genIndex];
      simData.Counts[generator.Resource] += simData.Counts[generator.Id] * generator.QtyPerSec * deltaTime;
      
      // index 0 & 1 make comrades & resources, so they also counts toward "comradeProgress" & "resourceProgress"
      if (genIndex == 0) {
        simData.Counts["comradeProgress"] += simData.Counts[generator.Id] * generator.QtyPerSec * deltaTime;
      } else if (genIndex == 1) {
        simData.Counts["resourceProgress"] += simData.Counts[generator.Id] * generator.QtyPerSec * deltaTime;
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
  
  if (time >= maxTime) {
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
