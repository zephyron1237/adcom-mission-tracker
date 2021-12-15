var missionData = {}; //  The main data structure used to store the current state of missions.
var missionCompletionTimes = {}; // Maps missionId's to when you completed them.  Can be viewed in the info popup of completed missions.
var currentMode = "main"; 
var currentMainRank = 1;
var eventScheduleInfo = null;  // The main schedule metadata associated with the current LteEvent
var ENGLISH_MAP = {}; // This gets filled in during mission.js's main(). After that, ENGLISH_MAP["active"] == "Active"

function main() {
  loadModeSettings();
  initializeLocalization();
  initializeAbTestGroups();
  initializeMissionData();
  initializePopups();
  initializeInputHandlers();
  loadSaveData();
  initializeIntervalFunctions();
  renderMissions();
}

// Determines whether the page is in Main or Event mode, based on the url and save state.
// If event, also determines the event (based on the current time and event schedule).
function loadModeSettings() {
  // URL PARAMETER OPTIONS:
  // + (none)
  //   -  Opens motherland or the current event, whichever was used last.
  // + ?rank=X
  //   -  X can be "event" (for current event), "main", or a motherland rank (1-MAX_RANK)
  // + ?mode=X
  //   -  X can be "event", "main", or "schedule" (intended to depricate rank=X for these values)
  // + ?event=X
  //   -  X is any event's EndTime, in milliseconds from epoch UTC.
  // + ?eventOverride=X
  //   -  Mostly for testing, X is a balance id like "crusade-bal-1"
  // + ?timeOverride=X
  //   -  For testing. Sets to the event running at X (milliseconds from epoch UTC).
  
  let now = Date.now();
  
  let splitUrl = window.location.href.split('#');
  splitUrl = splitUrl[0].split('?');
  if (splitUrl.length == 2) {
    let arguments = splitUrl[1].split('&');
    for (let arg of arguments) {
      let keyValue = arg.split('=');
      if (keyValue.length != 2) {
        continue;
      }
      
      if (keyValue[0] == "rank") {
        // Parse ?rank=X
        
        if (keyValue[1] == "event") {
          setGameLocal("CurrentMode", "event");
        } else if (keyValue[1] == "main") {
          setGameLocal("CurrentMode", "main");
        } else if (parseInt(keyValue[1])) {
          setGameLocal("CurrentMode", "main");
          setLocal("main", "CurrentRank", keyValue[1]);
        }
        
      } else if (keyValue[0] == "mode") {
        // Parse ?mode=X
        
        if (keyValue[1] == "event") {
          setGameLocal("CurrentMode", "event");
        } else if (keyValue[1] == "main") {
          setGameLocal("CurrentMode", "main");
        } else if (keyValue[1] == "schedule") {
          // Open the schedule popup when the page loads
          $(function() { $('#schedulePopup').modal(); })
        }
        
      } else if (keyValue[0] == "event") {
        // Parse ?event=
        
        // This is a lot like timeOverride, but more rigid
        let eventTime = parseInt(keyValue[1]);
        
        // Test one millisecond before the end time.
        // If right, the next event should end at that time.
        let eventCandidate = getCurrentEventInfo(eventTime - 1);
        if (eventCandidate.EndTimeMillis == eventTime) {
          eventScheduleInfo = eventCandidate;
          setGameLocal("CurrentMode", "event");
        }
        
      } else if (keyValue[0] == "timeOverride") {
        // Parse ?timeOverride=
        
        now = parseInt(keyValue[1]);
        setGameLocal("CurrentMode", "event");
        
      } else if (keyValue[0] == "eventOverride"
                  && keyValue[1] in DATA && keyValue[1] != "main") {
        // Parse ?eventOverride=X
        
        // This is a quick hack to allow switching to non-current events.
        setGameLocal("CurrentMode", "event");
        DATA.event = DATA[keyValue[1]];
        eventScheduleInfo = {
          LteId: keyValue[1],
          BalanceId: keyValue[1],
          ThemeId: keyValue[1].split('-')[0], // take the xxx part of xxx-bal-5
          StartTimeMillis: now,
          EndTimeMillis: now,
          Rewards: Array(20) // empty values, which the tracker handles gracefully
        };
        $('#overrideWarning').addClass("show");
        $('#alertReset').remove(); // don't show the Reset Alert ever in this mode.  Hacky.
      }
    }
  }
  
  // Get values from URL params > previous save > defaults.
  currentMode = getGameLocal("CurrentMode") || currentMode;
  currentMainRank = parseInt(getLocal("main", "CurrentRank")) || currentMainRank;
  
  // Determine eventScheduleInfo and DATA.event based on the Schedule (if needed).
  if (!eventScheduleInfo) {
    eventScheduleInfo = getCurrentEventInfo(now);
  }
  
  // Initialize fake (blank) events, used as stubs when datamined info is unavailable
  if (DATA[eventScheduleInfo.BalanceId]["fake"] && currentMode == "event") {
    DATA.event = {"Generators": [], "Industries": [], "Missions": [], "Researchers": [], "Resources": [{"Id":"potato"}]};
    $('#alertFakeEvent').removeClass("collapse");
  }
  
  // Otherwise, point DATA.event to the current event.  This is for legacy reasons.
  if (!("event" in DATA)) {
    DATA.event = DATA[eventScheduleInfo.BalanceId];
  }
  
  // Set up the top-left title in the navbar
  let icon = `<img class="scheduleIcon" src="${getImageDirectory()}/schedule.png">`;
  let eventIcon = `<img class="scheduleIcon" src="img/event/${eventScheduleInfo.ThemeId}/schedule.png">`;
  let eventName = THEME_ID_TITLE_OVERRIDES[eventScheduleInfo.ThemeId] || eventScheduleInfo.ThemeId;
  eventName = upperCaseFirstLetter(eventName);
  let title = (currentMode == "main") ? THEME_ID_TITLE_OVERRIDES["main"] : eventName;
  
  // The top-left dropdown always shows the current event, regardless of overrides.
  let trueCurrentEvent = getCurrentEventInfo();
  let trueCurrentEventTitle = THEME_ID_TITLE_OVERRIDES[trueCurrentEvent.ThemeId] || trueCurrentEvent.ThemeId;
  trueCurrentEventTitle = upperCaseFirstLetter(trueCurrentEventTitle);
  let trueEventIcon = `<img class="scheduleIcon" src="img/event/${trueCurrentEvent.ThemeId}/schedule.png">`;
  
  $('#mode-select-title').html(`${icon} ${title}`);
  $('#mode-select-title').addClass("show");
  $('#mode-select-event').html(`${trueEventIcon} ${trueCurrentEventTitle}`);
  
  $(`#mode-select-main,#mode-select-event`).removeClass("active");
  if (currentMode == "main" || trueCurrentEvent.EndTimeMillis == eventScheduleInfo.EndTimeMillis) {
    $(`#mode-select-${currentMode}`).addClass("active");
  } else {
    $('#mode-select-schedule').addClass("active");
  }
  
  // Set up the icon for the "All Generators" button in the navbar
  let firstResourceId = getData().Resources[0].Id;
  $('#viewAllGeneratorsButton').attr('style', `background-image:url('${getImageDirectory()}/${firstResourceId}.png`);
  
  // Show a "datamined" warning for future ranks that aren't in the current version
  if ((DATAMINE_WARNING_MIN_RANK && currentMode == "main" && currentMainRank >= DATAMINE_WARNING_MIN_RANK) ||
      (DATAMINE_WARNING_THEME_ID && currentMode == "event" && eventScheduleInfo.ThemeId == DATAMINE_WARNING_THEME_ID)) {
    $('#alertUnconfirmed').removeClass('collapse');
  }
}


// Returns the HTML for the body of the schedule popup
function getSchedulePopup() {
  let soonestEvents = getSoonestEventInfos();
  return soonestEvents.map(x => getSchedulePopupEvent(x)).join("<br />");
}

// Returns the HTML for the schedule event block for a given event
function getSchedulePopupEvent(eventInfo) {
  let shortOptions = { weekday: 'short', month: 'short', day: 'numeric' };
  let longOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', timeZoneName: 'short' };
  
  let start = new Date(eventInfo.StartTimeMillis);
  let startShort = start.toLocaleDateString(undefined, shortOptions);
  let startLong = start.toLocaleDateString(undefined, longOptions);
  
  let end = new Date(eventInfo.EndTimeMillis);
  let endShort = end.toLocaleDateString(undefined, shortOptions)
  let endLong = end.toLocaleDateString(undefined, longOptions);
  
  let lteId = eventInfo.LteId;
  let name = ENGLISH_MAP[`lte.${eventInfo.ThemeId}.name`];
  
  let headerClasses = "";
  if (currentMode == "event" && eventInfo.LteId == eventScheduleInfo.LteId) {
    // This is the currently-tracked event, highlight the header.
    headerClasses = "selected";
  }
  
  let top3RewardIcons = eventInfo.Rewards.slice(-3).map(r => getRewardIcon(r)).join('');
  let completionRewards = eventInfo.Rewards.map(r => `<li><span class="rewardListIconWrapper">${getRewardIcon(r)}</span> ${describeScheduleRankReward(r)}</li>`).join('');
  
  return `
    <div class="card">
      <div class="card-header scheduleHeader ${headerClasses}" data-toggle="collapse" data-target="#scheduleBody-${lteId}" aria-controls="scheduleBody-${lteId}">
        <img src='img/event/${eventInfo.ThemeId}/schedule.png' class="scheduleIconLarge">
        ${startShort} - ${endShort}
        <span class="float-right">${top3RewardIcons} <span class="ml-2">(+)</span></span>
      </div>
      <div class="collapse" id="scheduleBody-${lteId}">
        <div class="card-body">
          <div><strong>${name}</strong><span class="float-right"><a href="?event=${eventInfo.EndTimeMillis}">View in Tracker</a></span></div><br />
          <strong>Starts:</strong> ${startLong}<br />
          <strong>Ends:</strong> ${endLong}<br /><br />
          <strong>Rank Completion Rewards:</strong><br />
          <ol>${completionRewards}</ol>
        </div>
      </div>
    </div>`;
}

// Returns the current event info based on the time and the schedule's cycles
// "now" is an argument to allow for easier testing, but defaults to the current time.
function getCurrentEventInfo(now = Date.now()) {
  return getSoonestEventInfos(1, 1, now)[0];
}

function getSoonestEventInfos(minEventCount = 10, maxEventCount = 20, now = Date.now()) {
  // The current algorithm is: Search events where EndTime > Now and find the ones with the minimum EndTime.
  // Use a priority queue to keep track of the "maxEventCount" soonest events
  let soonestEvents = new PriorityQueue(maxEventCount, value => value.EndTimeMillis);
  
  // oneOffHours is a Set of each hour (as millis from Epoch) contained in all one-offs.
  // This is used when going through cycles to quickly determine if a one-off interrupts
  let oneOffHours = new Set();
  
  // Iterate through all the one-offs first before doing the cycles
  for (let oneOffEvent of SCHEDULE_CYCLES.LteOneOff) {
    updateSoonestOneOff(oneOffEvent, now, soonestEvents, oneOffHours);
  }
  
  // Before iterating through the cycles, limit them to ones that aren't over.
  let currentCycles = SCHEDULE_CYCLES.LteSchedule.filter(cycle => now < getScheduleTimeMillis(cycle.EndTime));
  let hoursPerBalanceId = getHoursPerBalanceId();
  
  for (let cycle of currentCycles) {
    updateSoonestCycle(cycle, now, soonestEvents, oneOffHours, hoursPerBalanceId);
  }
  
  // When we pop from the priority queue, they'll go from latest->soonest.
  // We add each to the start to reverse.
  let results = [];
  while (soonestEvents.size() > 0) {
    results.unshift(soonestEvents.pop());
  }
  
  
  // Finally, find the last new theme in the schedule, and pare it down
  // to the min required to see all themes, or at least "minEventCount"
  let foundThemes = new Set();
  let lastNewIndex = 0;
  
  for (resultIndex in results) {
    let theme = results[resultIndex].ThemeId;
    if (!foundThemes.has(theme)) {
      foundThemes.add(theme);
      lastNewIndex = resultIndex;
    }
  }
  
  let resultsToKeep = Math.max(minEventCount, parseInt(lastNewIndex) + 1);
  
  return results.slice(0, resultsToKeep);
}

function updateSoonestOneOff(oneOffEvent, now, soonestEvents, oneOffHours) {
  let startTimeMillis = getScheduleTimeMillis(oneOffEvent.StartTime);
  let endTimeMillis = getScheduleTimeMillis(oneOffEvent.EndTime);
  oneOffHours.add(endTimeMillis);
  
  for (let fakeEndTime = new Date(endTimeMillis);
       fakeEndTime.getTime() > startTimeMillis;
       fakeEndTime.setUTCHours(fakeEndTime.getUTCHours() - 1)) {
         
         oneOffHours.add(fakeEndTime.getTime());
  }
  
  if (now < endTimeMillis) {
    // This event is correctly in the future!
    // Non-legacy one-off's don't currently have a unique identifier, so let's use the endTime's timestamp.
    let lteId = oneOffEvent.LegacyLteId || endTimeMillis;
    
    soonestEvents.push({
      LteId: lteId,
      BalanceId: oneOffEvent.BalanceId,
      ThemeId: oneOffEvent.ThemeId,
      StartTimeMillis: startTimeMillis,
      EndTimeMillis: endTimeMillis,
      Rewards: getRewardsById(oneOffEvent.RewardId)
    });
  }
}

function updateSoonestCycle(cycle, now, soonestEvents, oneOffHours, hoursPerBalanceId) {
  // Iterate through the cycle until we find the first event where now < EndTime, compare with soonestEvent
  // (For a schedule of N, you could add the first N such events to the priority queue.)
  
  let DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Get the first StartTime of the event (Increase days from StartTime until we hit StartDayOfTheWeek)
  let goalDayOfWeek = DAYS.indexOf(cycle.StartDayOfTheWeek);
  let firstStartTime = new Date(getScheduleTimeMillis(cycle.StartTime));
  
  if (goalDayOfWeek == -1) {
    console.error(`ERROR: Cannot understand day of week: ${cycle.StartDayOfTheWeek}`);
    return;
  }
  
  while (firstStartTime.getUTCDay() != goalDayOfWeek) {
    firstStartTime.setUTCDate(firstStartTime.getUTCDate() + 1);
  }
  
  firstStartTime.setUTCHours(cycle.StartHourUTC);
  
  // From the first start time, calculate the first end time,
  // then iterate through each end time until now < EndTime
  let curCycleIndex = 0;
  let eventsFound = 0;
  let curEndTime = new Date(firstStartTime);
  let durationHours = hoursPerBalanceId[cycle.LteBalanceIds[0]];
  curEndTime.setUTCHours(curEndTime.getUTCHours() + durationHours);
  let durationMillis = durationHours * 3600000;
  
  let cycleEndTime = new Date(getScheduleTimeMillis(cycle.EndTime));
  
  while (curEndTime <= cycleEndTime && eventsFound < soonestEvents.maxSize) {
    // Move forward one week at a time until it's not replaced with a one-off.
    while (oneOffHours.has(curEndTime.getTime()) || oneOffHours.has(curEndTime.getTime() - durationMillis)) {
      curEndTime.setUTCDate(curEndTime.getUTCDate() + 7);
    }
    
    let balanceId = cycle.LteBalanceIds[curCycleIndex % cycle.LteBalanceIds.length];
    durationHours = hoursPerBalanceId[balanceId];
    let nextBalanceId = cycle.LteBalanceIds[(curCycleIndex + 1) % cycle.LteBalanceIds.length];
    let nextDurationHours = hoursPerBalanceId[nextBalanceId];
    
    if (now < curEndTime) {
      eventsFound += 1;
      
      let rewardId = cycle.LteRewardIds[curCycleIndex % cycle.LteRewardIds.length];
      let themeId = SCHEDULE_CYCLES.LteBalanceData.find(bal => bal.BalanceId == balanceId).ThemeId;
      let curStartTime = new Date(curEndTime);
      curStartTime.setUTCHours(curStartTime.getUTCHours() - durationHours);
      
      soonestEvents.push({
        LteId: curEndTime.getTime(),
        BalanceId: balanceId,
        ThemeId: themeId,
        StartTimeMillis: curStartTime.getTime(),
        EndTimeMillis: curEndTime.getTime(),
        Rewards: getRewardsById(rewardId)
      });
    }
    
    let hourDifference = nextDurationHours - durationHours;
    curEndTime.setUTCDate(curEndTime.getUTCDate() + 7)
    curEndTime.setUTCHours(curEndTime.getUTCHours() + hourDifference);
    
    curCycleIndex += 1;
  }
}

// Cleans up HH's date format on things like eventSchedule.EndTime and returns millis from Epoch.
function getScheduleTimeMillis(hhDateString) {
  // We append "Z" to the ISO8601 format to ensure it is interpretted as being GMT (instead of local time).
  if (hhDateString.slice(-1) != "Z") {
    hhDateString += "Z";
  }
  
  let date = new Date(hhDateString);
  return date.getTime();
}

// Returns a dictionary like {"crusade-bal-1": 100, ..., "power-bal-20": 3}
function getHoursPerBalanceId() {
  let hoursPerBalanceType = {};
  
  for (let balance of SCHEDULE_CYCLES.LteBalanceData) {
    hoursPerBalanceType[balance.BalanceId] = balance.DurationHours;
  }
  
  return hoursPerBalanceType;
}

// Returns just the rank rewards array for a given rewardId
function getRewardsById(rewardId) {
  let reward = SCHEDULE_CYCLES.LteRewards.find(r => r.RewardId == rewardId);
  if (reward) {
    return reward.Rewards;
  } else {
    return [];
  }
}

// Based on https://stackoverflow.com/questions/42919469/efficient-way-to-implement-priority-queue-in-javascript/42919752#42919752
// Sorry to whoever's reading this that this isn't well-organized
class PriorityQueue {
  constructor(maxSize = 0, priorityFunction = (value => value)) {
    this._heap = [];
    this._priorityFunction = priorityFunction; // For a given value, what is it's priority? e.g., value => value.Priority
    this._top = 0;
    this.maxSize = maxSize; // If maxSize > 0, enforces a maximum size() by the end of each operation.
  }
  size() {
    return this._heap.length;
  }
  isEmpty() {
    return this.size() == 0;
  }
  peek() {
    return this._heap[this._top];
  }
  push(...values) {
    values.forEach(value => {
      if (this.maxSize <= 0 ||
          this.size() < this.maxSize ||
          this._greaterPriority(this.peek(), value)) {
            
        this._heap.push(value);
        this._siftUp();
      }
    });
    while (this.maxSize > 0 && this.size() > this.maxSize) {
      this.pop();
    }
    return this.size();
  }
  pop() {
    const poppedValue = this.peek();
    const bottom = this.size() - 1;
    if (bottom > this._top) {
      this._swap(this._top, bottom);
    }
    this._heap.pop();
    this._siftDown();
    return poppedValue;
  }
  replace(value) {
    const replacedValue = this.peek();
    this._heap[this._top] = value;
    this._siftDown();
    return replacedValue;
  }
  _greaterPriority(i, j) {
    return this._priorityFunction(i) > this._priorityFunction(j);
  }
  _greaterIndex(i, j) {
    return this._priorityFunction(this._heap[i]) > this._priorityFunction(this._heap[j]);
  }
  _swap(i, j) {
    [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]];
  }
  _siftUp() {
    let node = this.size() - 1;
    while (node > this._top && this._greaterIndex(node, this._parent(node))) {
      this._swap(node, this._parent(node));
      node = this._parent(node);
    }
  }
  _siftDown() {
    let node = this._top;
    while (
      (this._left(node) < this.size() && this._greaterIndex(this._left(node), node)) ||
      (this._right(node) < this.size() && this._greaterIndex(this._right(node), node))
    ) {
      let maxChild = (this._right(node) < this.size() &&
                      this._greaterIndex(this._right(node), this._left(node))) ? 
                        this._right(node) :
                        this._left(node);
      this._swap(node, maxChild);
      node = maxChild;
    }
  }
  _parent(i) {
     return ((i + 1) >>> 1) - 1;
  }
  _left(i) {
     return (i << 1) + 1;
  }
  _right(i) {
    return (i + 1) << 1;
  }
}



// Sets up ENGLISH_MAP based on ENGLISH_LOCALIZATION_STRING
function initializeLocalization() {
  // Get all lines in the form key=value.  Values may include anything but real new lines.
  let lines = ENGLISH_LOCALIZATION_STRING.split(/\r?\n/);
  
  for (let line of lines) {
    let keyValue = line.match(/(.*?)=(.*)/);
    
    if (keyValue) {
      ENGLISH_MAP[keyValue[1]] = keyValue[2];
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
  
  let activeMissionCount = getData().Ranks[1].ActiveMissionCount;
  missionData = {Completed: {StartingCount: 0, Remaining: []}, Current: {StartingCount: activeMissionCount, Remaining: []}};
  
  let rank = 0;
  let missionsLeft = 0;
  let missions = getMissions();
  for (let missionIndex in missions) {
    if (missionsLeft == 0) {
      rank += 1;
      
      if (rank >= getData().Ranks.length) {
        // I'm not sure how the game presents this, but the stretch goals will be considered of one next rank
        missionsLeft = missions.length - missionIndex + 2;
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
    
    let mission = missions[missionIndex];
    mission.Rank = rank;
    mission.Index = parseInt(missionIndex);
    missionData[mission.Rank].Remaining.push(mission);
    
    missionsLeft -= 1;
  }
  
  // If missions exist, move three from Rank 1 to Current.
  if (missionData[1] !== undefined) {
    for (let i = 0; i < activeMissionCount; i++) {
      missionData.Current.Remaining.push(missionData[1].Remaining.shift());
    }
  }
}

// e.g., {1: {StartingCount: 3, Remaining: [...]}, 2: {...}, ..., Completed: {...}, Current: {...}, OtherRankMissionIds: [...]}
function initializeMainMissionData() {
  missionCompletionTimes = {};
  
  // Rank "N" data is stored in Ranks[N - 1]
  let activeMissionCount = getData().Ranks[currentMainRank - 1].ActiveMissionCount;
  missionData = {Completed: {StartingCount: 0, Remaining: []}, Current: {StartingCount: activeMissionCount, Remaining: []}, OtherRankMissionIds: []};
  
  // Assign indices for sorting
  let missions = getMissions();
  for (let mIndex = 0; mIndex < missions.length; mIndex++) {
    missions[mIndex].Index = mIndex;
  }
  
  // Fill in ranks
  for (let rank of getData().Ranks) {
    let rankMissions = missions.filter(m => m.Rank == rank.Rank);
    missionData[rank.Rank] = {StartingCount: rankMissions.length, Remaining: rankMissions};
  }
  
  for (let i = 0; i < activeMissionCount; i++) {
    missionData.Current.Remaining.push(missionData[currentMainRank].Remaining.shift());
  }
}

// Manually initializes popups and popovers, since Bootstrap requires it.
function initializePopups() {
  /* Based on code from https://getbootstrap.com/docs/4.0/components/modal/ */
  $('#infoPopup').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget); // Button that triggered the modal
    let missionId = button.data('mission'); // Extract info from data-* attributes
    if (!missionId) {
      return;
    }
    
    let mission = getMissions().find(m => m.Id == missionId);
    
    let modal = $(this);
    modal.find('.modal-title').html(describeMission(mission, "none"));
    modal.find('#infoReward').html(describeReward(mission.Reward));
    modal.find('#calc').html(renderCalculator(mission));
    
    let missionEtas = getMissionEtas();
    if (missionId in missionEtas) {
      modal.find('#lastEtaContainer').addClass('show');
      modal.find('#lastEta').text(getMissionEtaString(missionEtas[missionId]));
    } else {
      modal.find('#lastEtaContainer').removeClass('show');
    }
    
    if (missionId in missionCompletionTimes) {
      modal.find('#completionTimeContainer').addClass('show');
      modal.find('#completionTime').text(getTimeStampLocaleString(missionCompletionTimes[missionId]));
      
      // If it's completed, we don't need to also show an eta.
      modal.find('#lastEtaContainer').removeClass('show');
    } else {
      modal.find('#completionTimeContainer').removeClass('show');
    }
    
    $(function () {
      $('[data-toggle="popover"]').popover();
      updateImportButton();
    });
  });
  
  $('#allInfoPopup').on('show.bs.modal', function (event) {
    let button = $(event.relatedTarget); // Button that triggered the modal
    let activeTabId = button.data('tab'); // Extract info from data-* attributes
    
    // Fill in the body
    let modal = $(this);
    modal.find('#allInfoPopupBody').html(getAllIndustryPopup());
    
    // Set the correct tab to be active based on which button launched the popup.
    let activeTab = modal.find(`#${activeTabId}`);
    activeTab.addClass('active');
    activeTab.attr('aria-selected', 'true');
    
    modal.find(`[aria-labelledby="${activeTabId}"]`).addClass('show active');
    
    $(function () {
      $('[data-toggle="popover"]').popover();
    });
  });
  
  $('#schedulePopup').on('show.bs.modal', function (event) {
    // Fill in the body
    let modal = $(this);
    modal.find('#schedulePopupBody').html(getSchedulePopup());
    
    $(function () {
      $('[data-toggle="popover"]').popover();
    });
  });
  
  $('#rankPopupBody').html(getRankAdvanceHtml());
  $('#dataPopupBody').html(getDataManagementHtml());
  $('#helpPopupBody').html(getHelpHtml(true));
  $('#keyboardPopupBody').html(getKeyboardMacroHtml());

  $('#rankAdvanceConfirm').click(function() {
    advanceProgressTo();
  });
}

function initializeInputHandlers() {
  $('body').on('keyup', function(event) {
    inputKeyboardHandler(event);
  });
}

// Loads settings, and then save data, editing missionData in-place differently for main/events.
function loadSaveData() {
  // Load configuration first
  let iconConfig = getGlobal("IconConfig") || "image";
  setIcons(iconConfig, false);
  
  let styleConfig = getGlobal("StyleConfig") || "light";
  setStyle(styleConfig);
  
  setListStyle(isListActive(), false);
  
  if (getLocal("main", "CompletedVisible") == null) {
    let isNewSave = (getLocal("main", "Completed") == null);
    setLocal("main", "CompletedVisible", isNewSave.toString());  // New saves start open
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

function loadMainSaveData() {
  let dataString = getLocal("main", "Completed");
  if (!dataString) {
    return;
  }
  
  let completedIds = dataString.split(',');
  let curRankMissions = new Set(getMissions().filter(m => m.Rank == currentMainRank).map(m => m.Id));
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
  } else {
    
    // Motherland
    let curRankCompletedIds = missionData.Completed.Remaining.map(m => m.Id);
    let saveData = [...curRankCompletedIds, ...missionData.OtherRankMissionIds].join(',');
    setLocal("main", "Completed", saveData);
  }
  
  setLocal(currentMode, "CompletionTimes", JSON.stringify(missionCompletionTimes));
}

// Sets up any functions to be run constantly on an interval
function initializeIntervalFunctions() {
  setInterval(updateMissionButtonTitles, 60 * 1000);  // Update mission etas every 60 seconds.
}

// Updates the html of the page with all the mission data (i.e., rank boxes with mission buttons).
function renderMissions() {
  if (isListActive()) {
    // A bit of a hack.  List-mode does its own thing.
    renderListStyleMissions();
    return;
  }
  
  let missionHtml = "";
  
  let missionEtas = getMissionEtas();
  
  let sortedRanks;
  if (currentMode == "event") {
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
      if (getLocal("main", "CompletedVisible") == "true") {
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

      buttonsHtml += `<a type="button" class="btn btn-outline-secondary" data-toggle="modal" data-target="#rankPopup" title="Jump to a specific rank" onclick="focusRankSelectPrompt()">#</a>`;
      
      if (currentMainRank < DATA.main.Ranks.length) {
        buttonsHtml += `<a href="?rank=${currentMainRank + 1}" type="button" class="btn btn-outline-secondary" title="Go forward to Rank ${currentMainRank + 1}">&rarr;</a>`;
      }
      
      title = `Rank ${rank}<span class="float-right btn-group" role="group">${buttonsHtml}</span>`;
    } else {
      // A generic EVENT rank
      // Create the event rank popup.  Start with Completion Reward, if possible
      let rankReward = eventScheduleInfo.Rewards[rank - 1];
      let popupHtml = rankReward ? `<strong>Completion Reward:</strong><br />${getRewardIcon(rankReward, true)} ${describeScheduleRankReward(rankReward)}` : "";
      
      // On the special case of Rank 1, the popup shows the first scripted free capsule.
      let firstFreeId = getData().GachaFreeCycle[0].ScriptId;
      if (rank == 1 && firstFreeId) {
        let firstFreeScripted = getData().GachaScripts.find(script => script.GachaId == firstFreeId);
        let freeScience = `${firstFreeScripted.Science} <img class='rewardIcon' src='img/event/darkscience.png'> `;
        let freeResearchers = firstFreeScripted.Card.map(card => `<span class='text-nowrap'>${card.Value}x <img class='rewardIcon' src='img/shared/card.png'> ${researcherName(card.Id)}</span>`);
        let freeRewards = [freeScience, ...freeResearchers].join(', ');
        popupHtml += `${popupHtml ? "<hr />" : ""}<strong>First Free Capsule:</strong><br />${freeRewards}`;
      }
      
      // Finally, the popup show the researchers that get added that rank
      let rankResearchers = getData().Researchers.filter(r => r.PlayerRankUnlock == rank);
      if (rankResearchers.length > 0) {
        let rankResearcherDescriptions = rankResearchers.map(r => `<div class='resourceIcon cardIcon'>&nbsp;</div>${researcherName(r)}: <em>${getResearcherBasicDetails(r)}</em>`);
        let rankResearcherText = `<strong>New ${ENGLISH_MAP['gachapurchaseconfirmation.content.panel.go_researchers.txt_name']}:</strong><br />${rankResearcherDescriptions.join("<br /><br />")}`;
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
      missionHtml += getHelpHtml(false);
    }
    
    if (currentMode == "main" && rank == currentMainRank && missionData[rank].Remaining.length == 0 && missionData.Current.Remaining.length == 0) {
      // In the main mode, when you run out of missions, give a helpful message.
      missionHtml += `<ul><li>Congratulations on completing all missions in Rank ${rank}!</li><li>To go to the next rank, click the &rarr; button in the corner.</li></ul>`;
    } else {
      // Display all missions inside of the rank
      for (let mission of missionData[rank].Remaining) {
        missionHtml += `<span id="container-${mission.Id}" class="missionContainer">${renderMissionButton(mission, rank, missionEtas)}</span>`;
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

// This text appears in the help popup and before a user interacts with the Tracker (i.e., when Completed is empty and uncollpased)
function getHelpHtml(isPopup) {
  let firstResourceId = getData().Resources[0].Id;
  let wordForResearchers = upperCaseFirstLetter(ENGLISH_MAP[`conditionmodel.researcher.plural`]);
  let result = "";
  
  result += `<ul><li class="my-1">Click <strong>Current</strong> missions to move them to Completed.</li>`;
  result += `<li class="my-1">Click <strong>Completed</strong> missions to move them back to Current.</li>`;
  result += `<li class="my-1">Click ${isPopup? "the Completed tab's" : "this tab's"} toggle at the top-right &UpperRightArrow; to <strong>hide Completed</strong> missions.</li>`;
  result += `<li class="my-1">Click the capsule <span class="resourceIcon wood">&nbsp;</span> next to a mission to access its <strong>Calculator</strong>.</li>`;
  result += `<li class="my-1">If the capsule <span class="scriptedRewardInfo resourceIcon wood">&nbsp;</span> is circled, you can also view the <strong>pre-scripted rewards</strong>.</li>`;
  result += `<li class="my-1">Click the <span class="resourceIcon" style="background-image:url('${getImageDirectory()}/${firstResourceId}.png')">&nbsp;</span> at the top to view all <strong>Resources/Generators</strong>, and <span class="resourceIcon cardIcon">&nbsp;</span> to view all <strong>${wordForResearchers}</strong>.</li>`;
  result += `<li class="my-1">Got <strong>questions?</strong>  Check out the <a href="${SOCIAL_HELP_URLS['faq']}">Game Guide/FAQ</a>, <a href="${SOCIAL_HELP_URLS['discord']}">Discord</a>, or <a href="${SOCIAL_HELP_URLS['reddit']}">Reddit</a>.</li></ul>`;
  
  return result;
}

function getKeyboardMacroHtml() {
  result = `<p>The tracker supports a number of keyboard shortcuts.</p>
<ul>
  <li class="my-1"><kbd>Esc</kbd> Close visible modal box</li>
  <li class="my-1"><kbd>Enter</kbd> Run calculation</li>
  <li class="my-1"><kbd>Ctrl+Enter</kbd> Import previous counts</li>
  <li class="my-1"><kbd>Ctrl+Shift+Enter</kbd> Import previous counts AND run calculation</li>
  <li class="my-1"><kbd>Alt+<em>x</em></kbd>/<kbd>Option+<em>x</em></kbd> Focus on <em>x</em>th generator/${resourceName('comrade').toLowerCase()} trade if available<br>(0 => 10, minus key => 11, equals key => 12)</li>
  <li class="my-1"><kbd>Alt+R</kbd>/<kbd>Option+R</kbd> Focus on resource quantity</li>
  <li class="my-1"><kbd>Alt+P</kbd>/<kbd>Option+P</kbd> Focus on resource progress</li>
  <li class="my-1"><kbd>Alt+C</kbd>/<kbd>Option+C</kbd> Focus on number of ${resourceName('comrade', true).toLowerCase()}</li>
  <li class="my-1"><kbd>Alt+S</kbd>/<kbd>Option+S</kbd> Focus on ${resourceName('comrade', true).toLowerCase()} per second</li>
</ul>
<p>You can also adjust the value of an input box by referring to the table below. Holding <kbd>Up Arrow</kbd> and the appropriate key(s) will result in additive or multiplicative behavior. Conversely, holding <kbd>Down Arrow</kbd> and the appropriate key will result in subtractive or divisive behavior. The column without a modifier key indicates that no modifier is required.</p>
<div class="keyboardShortcutHolder">
  <table class="table">
    <thead>
      <th></th>
      <th>&#177;Alt/Option</th>
      <th>&#177;</th>
      <th>&#177;Shift</th>
      <th>&#177;Ctrl</th>
      <th>&#177;Ctrl+Shift</th>
    </thead>
    <tbody>
      <tr>
        <td>Generator count</td>
        <td>&#177;Tenths place</td>
        <td>&#177;Ones place</td>
        <td>&#177;Tens place</td>
        <td>&#177;Hundreds place</td>
        <td>&#177;One letter</td>
      </tr>
      <tr>
        <td>Resource count</td>
        <td>&#177;Tenths place</td>
        <td>&#177;Ones place</td>
        <td>&#177;Tens place</td>
        <td>&#177;Hundreds place</td>
        <td>&#177;One letter</td>
      </tr>
      <tr>
        <td>${resourceName('comrade', false)} trades</td>
        <td>N/A</td>
        <td>&#177;1</td>
        <td>&#177;5</td>
        <td>&#177;25</td>
        <td>&#177;125</td>
      </tr>
      <tr>
        <td>${resourceName('comrade', false)} count</td>
        <td>&#177;1</td>
        <td>&#177;${bigNum(1e3)}</td>
        <td>&#177;${bigNum(1e6)}</td>
        <td>&#177;${bigNum(1e9)}</td>
        <td>&#177;${bigNum(1e12)}</td>
      </tr>
      <tr>
        <td>${resourceName('comrade', true)} per second</td>
        <td>&#177;1</td>
        <td>&#177;${bigNum(1e2)}</td>
        <td>&#177;${bigNum(1e4)}</td>
        <td>&#177;${bigNum(1e6)}</td>
        <td>&#177;${bigNum(1e8)}</td>
      </tr>
    </tbody>
  </table>
</div>
<p>Safeguards in the keyboard handler methods are implemented to prevent access to any negative or infinite values.</p>`;
  return result;
}

function getRankAdvanceHtml() {
  let currentText;
  let iconUrl;

  if (currentMode === 'main') {
    currentText = 'Please enter the rank to navigate to.';
    iconUrl = `${getImageDirectory()}/schedule.png`;
  } else {
    currentText = 'Please enter the rank to navigate to.<br>All previous missions will be marked as complete.';
    iconUrl = `img/event/${eventScheduleInfo.ThemeId}/schedule.png`;
  }

  return `<div id="rank-${currentMode}-holder">
  <p>${currentText}</p>
  <div class="input-group my-1">
    <div class="input-group-prepend"><span class="input-group-text inputIcon" style="background-image: url('${iconUrl}');">&nbsp;</span></div>
    <input type="number" class="form-control" id="rank-${currentMode}" value="" min="1" max="${getData().Ranks.length}" placeholder="Range: [1, ${getData().Ranks.length}]">
  </div>
  <div>
    <div class="rank-advance-alert">
      <p id="rankAdvanceAlert"></p>
    </div>
    <div class="rank-advance-buttons">
      <button type="submit" class="btn btn-success" id="rankAdvanceConfirm" aria-label="OK">OK</button>
      <button type="submit" class="btn btn-danger" data-dismiss="modal" aria-label="Cancel">Cancel</button>
    </div>
  </div>
</div>`;
}

function getDataManagementHtml() {
  let currentModeTitle;
  
  if (currentMode === 'main') {
    currentModeTitle = THEME_ID_TITLE_OVERRIDES["main"]; // different names for Ages/AdCom
  } else {
    currentModeTitle = `${upperCaseFirstLetter(THEME_ID_TITLE_OVERRIDES[eventScheduleInfo.ThemeId] || eventScheduleInfo.ThemeId)} event`;
  }

  return `<div id="data-management-holder">
  <p>Please exercise caution in this menu. Once you choose to delete data, it cannot be restored.</p>
  <div>
    <div class="data-management-key">
      <p>${currentModeTitle} data</p>
    </div>
    <div class="data-management-buttons">
      <button type="submit" class="btn btn-danger" data-dismiss="modal" aria-label="Reset ${currentModeTitle} data" onclick="resetProgress()">Reset</button>
    </div>
  </div>
  <div>
    <div class="data-management-key">
      <p><strong>All data</strong> (including other Trackers)</p>
    </div>
    <div class="data-management-buttons">
      <button type="submit" class="btn btn-danger" data-dismiss="modal" aria-label="Reset all data" onclick="resetAllProgress()">Reset</button>
    </div>
  </div>
  <div>
    <div class="data-management-key"></div>
    <div class="data-management-buttons">
      <button type="submit" class="btn btn-success" data-dismiss="modal" aria-label="Close">Close</button>
    </div>
  </div>
</div>`;
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
    
    let rankMissions = getMissions().filter(m => m.Rank == rank.Rank);
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
      if (rank in missionData) {
        for (let i = 0; i < missionData[rank].StartingCount; i++) {
          eventRankTitles.push(`${rank} (${i}/${missionData[rank].StartingCount})`);
        }
      }
    }
  }
  
  return eventRankTitles[missionData.Completed.Remaining.length];
}

function describeScheduleRankReward(reward) {
  switch (reward.Reward) {
    case "Resources":
      return `${reward.Value} ${resourceName(reward.RewardId)}`;
      break;
      
    case "Gacha":
      let gachaName = ENGLISH_MAP[`gacha.${reward.RewardId}.name`];
      return `${gachaName} capsule`;
      break;
      
    case "Researcher":
      let researcherRarity = ENGLISH_MAP[`researcher.rarity.${reward.RewardId}.name`];
      let singularOrPlural = (reward.Value > 1) ? "plural" :"singular";
      let wordForResearcher = ENGLISH_MAP[`conditionmodel.researcher.${singularOrPlural}`].toLowerCase();
      return `${reward.Value} ${researcherRarity} ${wordForResearcher}`;
      break;
  }
}

// Given a root.Missions object, returns an html string of a mission button
function renderMissionButton(mission, rank, missionEtas) {
  let type = mission.Condition.ConditionType;
  let buttonClass = "";
  
  if (!missionData.Current.Remaining.includes(mission) && !missionData.Completed.Remaining.includes(mission)) {
    buttonClass = "disabled ";
  }
  
  let buttonOutlineStyle = (rank == "Completed") ? "btn" : "btn-outline";
  
  let etaTimeStamp = missionEtas[mission.Id];
  let buttonDescription = "";
  if (rank == "Completed") {
    buttonDescription = "Uncomplete mission"
  } else if (rank == "Current" && !etaTimeStamp) {
    buttonDescription = "Complete mission"
  } else if (etaTimeStamp) {
    // We have an eta for this button
    buttonDescription = `ETA: ${getMissionEtaString(etaTimeStamp)}`;
  }
  
  if (type == "ResourcesSpentSinceSubscription" || type == "ResearchersUpgradedSinceSubscription") {
    buttonClass += `${buttonOutlineStyle}-danger`;
  } else if (type == "ResearcherCardsEarnedSinceSubscription") {
    buttonClass += `${buttonOutlineStyle}-success`;
  } else {
    buttonClass += `${buttonOutlineStyle}-secondary`;
  }
  
  let rewardImageClasses = getRewardImageClass(mission);
  
  if (rank != "Completed" && rank != "Current") {
    rewardImageClasses += " disabled";
  }
  
  if ("AbTestConfig" in mission) {
    let splitGroupId = mission.AbTestConfig.split("|");
    let testName = splitGroupId[0];
    let groupName = splitGroupId[1];
    
    let groupMap = getAvailableAbTestGroups();
    let groupsForTest = groupMap[testName];
    let groupIndex = groupsForTest.indexOf(groupName);
    
    let groupClass = `altGroup-${groupIndex}`;
    let nextGroupIndex = (groupIndex + 1) % groupsForTest.length;
    let nextGroupName = groupsForTest[nextGroupIndex];
    let groupTitleText = `Switch from ${mission.AbTestConfig} to alternate mission group ${testName}|${nextGroupName}`;
    
    return `<span class="altEmptySpan"></span><button id="button-${mission.Id}" class="btn ${buttonClass}" onclick="clickMission('${mission.Id}')" title="${buttonDescription}">${describeMission(mission)}</button><a href="javascript:void(0);" class="infoButton resourceIcon altMissionButton ${groupClass} ml-1" onclick="switchToNextAbGroup('${mission.Id}')" title="${groupTitleText}">&nbsp;</a><a href="#" class="infoButton ${rewardImageClasses} resourceIcon ml-1" data-toggle="modal" data-target="#infoPopup" data-mission="${mission.Id}" title="Click for mission info/calc">&nbsp;</a>`;
  } else {
    return `<button id="button-${mission.Id}" class="btn ${buttonClass}" onclick="clickMission('${mission.Id}')" title="${buttonDescription}">${describeMission(mission)}</button><a href="#" class="infoButton ${rewardImageClasses} resourceIcon ml-1" data-toggle="modal" data-target="#infoPopup" data-mission="${mission.Id}" title="Click for mission info/calc">&nbsp;</a>`;
  }
}

// Returns the css class(es) of the reward associated with a given mission
function getRewardImageClass(mission) {
  if (mission.Reward.Reward != "Gacha") {
    return "wood scriptedRewardInfo"; // Default to wood capsule icons for unusual rewards
  }
  
  let gacha = getData().GachaLootTable.find(gacha => gacha.Id == mission.Reward.RewardId);
  
  if (gacha.Type != "Scripted") {
    return gacha.Id;
    
  } else {
    let script = getData().GachaScripts.find(script => script.GachaId == gacha.Id);
    return `${script.MimicGachaId} scriptedRewardInfo`;
  }
}

// Returns a formatted string that's used for full eta descriptions for missions
function getMissionEtaString(etaTimeStamp) {
  let currentTimeStamp = (new Date()).getTime();
  let milliDifference = etaTimeStamp - currentTimeStamp;
  
  if (milliDifference <= 0) {
    return "Complete?";
  } else {
    let localeDate = getTimeStampLocaleString(etaTimeStamp);
    return `${getEta(milliDifference / 1000)} (${localeDate})`;
  }
}

// This is intended to be used as a standard format for the places where a DateTime is shown
function getTimeStampLocaleString(timeStamp) {
  let date = new Date(timeStamp);
  
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: '2-digit', month: '2-digit', day: '2-digit',
     hour: 'numeric', minute: 'numeric', second: 'numeric'
  });
}

var scriptedRewardIds = null;
function hasScriptedReward(mission) {
  if (scriptedRewardIds == null) {
    // Build a cache of scripted gacha ids
    scriptedRewardIds = new Set(getData().GachaScripts.map(gs => gs.GachaId));
  }
  
  return scriptedRewardIds.has(mission.Reward.RewardId);
}

// Called on-request for a single mission, or periodically for all, updates the ETAs in button titles
function updateMissionButtonTitles(singleMissionId = null) {
  let missionEtas = getMissionEtas();
  
  if (singleMissionId && !missionEtas[singleMissionId]) {
    return; // if we're doing a single mission, but don't have an eta, do nothing.
  }
  
  // Either iterate over just singleMissionId or all missions with an eta
  let missionIds = singleMissionId ? [singleMissionId] : Object.keys(missionEtas);
  
  // Make sure they're not completed.
  let completedIds = new Set(missionData.Completed.Remaining.map(mission => mission.Id))
  missionIds = missionIds.filter(id => !completedIds.has(id));
  
  for (let missionId of missionIds) {
    $(`#button-${missionId}`).prop('title', `ETA: ${getMissionEtaString(missionEtas[missionId])}`);
  }
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
    
    let completedMission = missionData.Completed.Remaining[foundIndex];
    let addToRank = "Current";
  
    // But first, kick out the newest (highest-index) mission of Current, if reasonable.
    if (missionData.Current.Remaining.length == missionData.Current.StartingCount) {
      let newestMission = missionData.Current.Remaining.reduce((prev, cur) => (prev.Index > cur.Index) ? prev : cur);
      
      if (completedMission.Index > newestMission.Index) {
        // If the completed mission is after all three Current, skip Current and add directly to rank.
        addToRank = completedMission.Rank;
        
      } else {
        // Otherwise, actually kick out the newest Current mission.
        let newestIndex = missionData.Current.Remaining.indexOf(newestMission);
        missionData.Current.Remaining.splice(newestIndex, 1);
        missionData[newestMission.Rank].Remaining.unshift(newestMission);
        missionData[newestMission.Rank].Remaining.sort((a, b) => a.Index - b.Index);
      }
    }
    
    // Ok, now back to undoing it to Current
    missionData.Completed.Remaining.splice(foundIndex, 1);
    missionData[addToRank].Remaining.push(completedMission);
    missionData[addToRank].Remaining.sort((a, b) => a.Index - b.Index);
    
    if (missionId in missionCompletionTimes) {
      delete missionCompletionTimes[missionId];
    }
    
    updateSaveData();
    renderMissions();
  }
}

// Converts numbers to AdCom style. bigNum(1E21) => "1 CC", significantCharacters includes the decimal point
function bigNum(x, minimumCutoff = 1e+6, significantCharacters = 100, localeOverride = undefined) {
  if (x < minimumCutoff) {
    // We also need to turn non-breaking spaces (char-160 == 0xA0) into normal spaces.
    return x.toLocaleString(localeOverride).replace(/\xA0/g, " ");
  }
  
  let digits = Math.floor(Math.log10(x));
  let thousands = Math.floor(digits / 3);
  let mantissa = x / Math.pow(10, thousands * 3);
  let numberString = mantissa.toLocaleString(localeOverride, {maximumFractionDigits: 2}).slice(0, significantCharacters + 1);
  numberString = numberString.replace(/\xA0/g, " ");
  return `${numberString} ${POWERS[thousands - 1]}`;
}

// This is like bigNum but enforces 3 sig figs after 9999
function shortBigNum(x) {
  return bigNum(x, 1e4, 3);
}

// Converts AdCom style numbers to normal. fromBigNum("1 CC") => 1E21
// Can provide an optional localeOverride like "hu-HU" for testing
function fromBigNum(x, localeOverride = undefined) {
  if (x == null) {
    return NaN;
  } else if (x.length == 0) {
    return "";
  } else if (!/(-?[\d\.,]+)/.test(x)) {
    return NaN;
  }
  
  x = x.replace(/\xA0/g, " "); // Turn non-breaking spaces (char-160 == 0xA0) into normal spaces.

  // Grab digits and the letters, and filter out anything missing.
  let split = [.../(-?[\d\., ]+)? *(\w+)?/g.exec(x)].filter((y,i) => y != undefined && i>0);
  
  if (split.length == 1) {
    return parseLocaleNumber(split[0], localeOverride);
    
  } else if (split.length == 2) {    
    let powerIndex = POWERS.indexOf(split[1].toUpperCase());
    let mantissa = parseLocaleNumber(split[0], localeOverride);
    if (powerIndex != -1 && !isNaN(mantissa)) {
      return mantissa * Math.pow(1000, powerIndex + 1);
    }
  }
  
  return NaN;
}

/* From https://stackoverflow.com/questions/12004808/does-javascript-take-local-decimal-separators-into-account/42213804#42213804 */
function parseLocaleNumber(stringNumber, localeOverride = undefined) {
  let decimalSeparator = (1.1).toLocaleString(localeOverride).replace(/1/g, '') || "."; // This is typically "." (default) or ","
  let thousandSeparator = (11111).toLocaleString(localeOverride).replace(/1/g, ''); // This is typically "," "." or " " (default based on decimal)
  
  // If there is no thousand separator, use the opposite of the decimal seperator
  if (!thousandSeparator) {
    if (decimalSeparator != ",") {
      thousandSeparator = ",";
    } else {
      thousandSeparator = ".";
    }
  } else if (thousandSeparator == String.fromCharCode(160)) {
    thousandSeparator = " "; // Turn all non-breaking spaces into normal spaces
  }
  
  let reformattedNumber = stringNumber
    .replace(new RegExp('\\' + thousandSeparator, 'g'), '') // remove all thousands separators
    .replace(new RegExp('\\' + decimalSeparator), '.'); // switch the optional decimal point to "."
  return Number(reformattedNumber);
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

function resourceName(resourceId, isPluralized = true) {
  if (isPluralized) {
    return ENGLISH_MAP[`resource.${resourceId}.plural`];
  } else {
    return ENGLISH_MAP[`resource.${resourceId}.singular`];
  }
}

function industryName(industryId) {
  // We lowercase since the game is somewhat inconsistant with industry capitalization
  return ENGLISH_MAP[industryId.toLowerCase()];
}

// researcherIdOrObj can either be a root.Researchers object or a string id
function researcherName(researcherIdOrObj) {
  let id = "";
  if (typeof researcherIdOrObj === 'string' || researcherIdOrObj instanceof String) {
    id = researcherIdOrObj;
  } else  if (researcherIdOrObj && 'Id' in researcherIdOrObj) {
    id = researcherIdOrObj.Id;
  }
  
  return ENGLISH_MAP[`researcher.${id}.name`]
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
      textHtml =`${upperCaseFirstLetter(ENGLISH_MAP['conditionmodel.trade.singular'])} ${resourceName(condition.ConditionId)} (${condition.Threshold})`;
      break;
    case "ResearchersUpgradedSinceSubscription": {
      let overrideDirectory = (currentMode == "event") ? "img/event" : "";
      iconHtml = getMissionIcon("upgrade", condition.ConditionType, overrideIcon, overrideDirectory);
      textHtml = `${ENGLISH_MAP['mission.researchersupgradedsincesubscription.any.simplename']} (${condition.Threshold})`;
      break;
    } case "ResourceQuantity": {
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon);
      textHtml = `Own ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold).replace(/ /g, '&nbsp;')})`;
      break;
    } case "IndustryUnlocked": {
      let resourceId = getResourceByIndustry(condition.ConditionId).Id;      
      iconHtml = getMissionIcon(resourceId, condition.ConditionType, overrideIcon);
      textHtml = `Unlock ${resourceName(resourceId)}`;
      break;
    } case "ResourcesEarnedSinceSubscription": {
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon);
      textHtml = `Collect ${resourceName(condition.ConditionId)} (${bigNum(condition.Threshold).replace(/ /g, '&nbsp;')})`;
      break;
    } case "ResearcherCardsEarnedSinceSubscription": {
      iconHtml = getMissionIcon("card", condition.ConditionType, overrideIcon, "img/shared");
      textHtml = `Collect Cards (${condition.Threshold})`;
      break;
    } case "ResourcesSpentSinceSubscription": {
      let overrideDirectory = (currentMode == "event") ? "img/event" : "";  // Use /img/event/ of /img/event/theme/
      iconHtml = getMissionIcon(condition.ConditionId, condition.ConditionType, overrideIcon, overrideDirectory);
      textHtml = `Spend ${resourceName(condition.ConditionId)} (${condition.Threshold})`;
      break;
    } default:
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
            
      let gold = script.Gold ? `${script.Gold} ${resourceName('gold')}` : null;
      let scienceIcon = (currentMode == "main") ? "science" : "darkscience";
      let science = script.Science ? `${script.Science}<span class="resourceIcon ${scienceIcon}">&nbsp;</span>` : null;      
      let cards = script.Card.map(card => `<span class="text-nowrap">${cardValueCount(card)}${describeResearcher(getData().Researchers.find(r => r.Id == card.Id))}</span>`).join(', ') || null;
      
      let rewards = [gold, science, cards].filter(x => x != null).join('. ');
      
      return `Scripted <span class="capsule ${script.MimicGachaId}">&nbsp;</span>: ${rewards}`;
    } else {
      return `Random <span class="capsule ${reward.RewardId}">&nbsp;</span>`;
    }
    
  } else {    
    return `Unknown reward: ${reward.Reward}`;
  }
}

// Given a SCHEDULE_CYCLES.LteRewards.Rewards[i] object, return an html string representing the reward as a small icon.
function getRewardIcon(reward, imageOnly = false) {
  let fileName = reward.RewardId;
  
  if (reward.Reward == "Gacha") {
    fileName = `capsule-${reward.RewardId}`;
  } else if (reward.Reward == "Researcher") {
    fileName = `card-${reward.RewardId}`;
  }
  
  let imgHtml = `<img class='mx-1 rewardIcon' src='img/main/${fileName}.png'>`;
  
  if (imageOnly || reward.Reward == "Gacha") {
    return imgHtml;
  } else {
    return `<span class='rewardIconWrapper'>${imgHtml}<span class='rewardIconText'>${bigNum(reward.Value, 1000, 2)}</span></span>`;
  }
}

// Given a root.Researchers object, returns an html string with a clickable version of their name with a popover description.
function describeResearcher(researcher) {
  let details = getResearcherFullDetailsHtml(researcher);
  return `<a tabindex="0" class="researcherName" role="button" data-toggle="popover" data-placement="bottom" data-trigger="focus" data-content="${details}" data-html="true"><div class="resourceIcon cardIcon">&nbsp;</div>${researcherName(researcher)}</a>`;
}

// Given a root.Researchers object, returns an html description of that researcher's effect, its unlock rank, and its first guaranteed mission
function getResearcherFullDetailsHtml(researcher) {
  let html = `<em>${getResearcherBasicDetails(researcher)}</em><br />`;
  
  html += `Unlocks at Rank ${researcher.PlayerRankUnlock}<br />`;
  
  let scriptedMission = getFirstMissionWithScriptedReward(researcher);
  if (scriptedMission) {
    html += `First guaranteed: ${describeMission(scriptedMission, "none")}`;
  } else {
    html += `No guaranteed copies.`;
  };
  
  return html;
}

// Given a root.Researchers object, returns a plaintext description of that researcher's effect.
function getResearcherBasicDetails(researcher) {
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
        return `All ${ENGLISH_MAP['conditionmodel.trade.plural']} grant ${vals[0]}x/${vals[1]}x/${vals[2]}x/... ${resourceName('comrade')}`;
      } else {
        let wordForTrading = ENGLISH_MAP['researcher.tradepayoutmultiplier.single'].split(' ')[0];
        return `${wordForTrading} ${resources.join('/')} grants ${vals[0]}x/${vals[1]}x/${vals[2]}x/... ${resourceName('comrade')}`;
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
        resources = researcher.TargetIds[0].split(/, ?/).map(ind => industryName(ind));
        if (resources.length == getData().Industries.length) {
          return `Multiplies output of all generators by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
        } else {
          return `Multiplies output of every ${resources.join('/')} generator by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
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
        resources = resources.map(ind => industryName(ind)).join('/');
        return `Increases crit chance of every ${resources} generator by ${vals[0]}/${vals[1]}/${vals[2]}/...`;
      }
      break;
      
    case "GeneratorCostReduction":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      // TargetIds[0] is a set of industries ("Baking, NorthPole, SnowArmy, SantaWorkshop")
      resources = researcher.TargetIds[0].split(/, ?/).map(ind => industryName(ind));
      if (resources.length == getData().Industries.length) {
        return `Lowers cost of all generators by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      } else {
        return `Lowers cost of every ${resources.join('/')} generator by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      }
      break;
    
    case "GeneratorCritPowerMult":
      vals = [researcher.ExpoMultiplier * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth,
              researcher.ExpoMultiplier * researcher.ExpoGrowth * researcher.ExpoGrowth * researcher.ExpoGrowth];
      // TargetIds[0] is a set of industries ("Baking, NorthPole, SnowArmy, SantaWorkshop")
      resources = researcher.TargetIds[0].split(/, ?/).map(ind => industryName(ind));
      if (resources.length == getData().Industries.length) {
        return `Multiplies crit bonus of all generators by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      } else {
        return `Multiplies crit bonus of every ${resources.join('/')} generator by ${vals[0]}x/${vals[1]}x/${vals[2]}x/...`;
      }
      break;
      
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
  return `${card.Value}x`;
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


function getImageDirectory(overrideDirectory = "") {
  if (overrideDirectory) {
    return overrideDirectory;
  } else if (currentMode == "event" && eventScheduleInfo && eventScheduleInfo.ThemeId) {
    return `img/${currentMode}/${eventScheduleInfo.ThemeId}`;
  } else {
    return `img/${currentMode}`;
  }
}

// Used in describeMission to get an approriate icon based on the settings and resource involved.
function getMissionIcon(resourceId, missionConditionType, overrideIcon = "", overrideDirectory = "") {
  let imgDirectory = getImageDirectory(overrideDirectory);
  
  let iconConfig = overrideIcon || getGlobal("IconConfig");
  if (iconConfig == "none") {
    return "";
  } else if (iconConfig == "emoji") {
    return MISSION_EMOJI[missionConditionType];
  } else {
    return `<span style="background-image: url('${imgDirectory}/${resourceId}.png');" class="resourceIcon">&nbsp;</span>`;
  }
}

// Run OnClick for the big visibility toggle of Completed.
function toggleCompleted() {
  let element = document.getElementById('Completed-body');
  if (getLocal("main", "CompletedVisible") == "true") {
    setLocal("main", "CompletedVisible", "false");
    element.style.display = "none";
  } else {
    setLocal("main", "CompletedVisible", "true");
    element.style.display = "block";
  }
}

// Run whenever the icon setting changes (OnClick) or is initialized.
function setIcons(iconType, shouldRenderMissions = true) {
  if (iconType != "none") {
    iconType = "image";  // Force it to these two options
  }
  
  setGlobal('IconConfig', iconType);
  
  $('#config-style-icons').removeClass('active');
  if (iconType == "image") {
    $('#config-style-icons').addClass('active');
  }
  
  if (shouldRenderMissions) {
    renderMissions();
  }
}

function toggleIconsStyle() {
  let currentType = getGlobal('IconConfig');
  if (currentType == "image") {
    setIcons("none");
  } else {
    setIcons("image");
  }
}

var StylesheetUrls = {
  light: "https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/css/bootstrap.min.css",
  dark: "https://stackpath.bootstrapcdn.com/bootswatch/4.3.1/cyborg/bootstrap.min.css"
};

// Run whenever the style setting changes (OnClick) or is initialized.
function setStyle(styleType) {
  setGlobal('StyleConfig', styleType);
  
  $('#config-style-dark').removeClass('active');
  if (styleType == "dark") {
    $('#config-style-dark').addClass('active');
  }
  
  if (styleType in StylesheetUrls) {
    $('#stylesheet').attr('href', StylesheetUrls[styleType]);
    
    let styleIds = Object.keys(StylesheetUrls).join(" ");
    $('#body').removeClass(styleIds).addClass(styleType);
  }  
}

function toggleDarkStyle() {
  let currentStyle = getGlobal('StyleConfig');
  if (currentStyle == 'dark') {
    setStyle('light');
  } else {
    setStyle('dark');
  }
}

// Run OnClick for the list style option.
function toggleListStyle() {
  let currentListStyle = getGlobal('ListStyleActiveConfig');
  setListStyle(!(currentListStyle == "true"));
}

// Run whenever the list style option changes (OnClick) or is initialized.
function setListStyle(isListActive, shouldRenderMissions = true) {
  setGlobal('ListStyleActiveConfig', isListActive);
  
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
  return (getGlobal('ListStyleActiveConfig') == "true");
}

// Prompts the user for a rank and attempts to advance their progress to that rank.
// For main, this is identical to the "#" button and just switches your current rank setting.
// For events, it auto-completes all missions prior to the rank.
function advanceProgressTo() {
  if (currentMode === "main") {
    let inputRank = parseInt($("#rank-main").val());

    if (inputRank < 1 || inputRank > getData().Ranks.length || !inputRank) {
      $("#rankAdvanceAlert").addClass("text-danger");
      $("#rankAdvanceAlert").text("Invalid rank.");

      setTimeout(function() {
        $("#rankAdvanceAlert").text("");
      }, 1500);
    } else {
      $("#rankAdvanceAlert").addClass("text-success");
      $("#rankAdvanceAlert").text("Please wait ...");
      let splitUrl = window.location.href.split('?');
      window.location.assign(`${splitUrl[0]}?rank=${inputRank}`);
    }
  } else {
    let inputRank = parseInt($("#rank-event").val());

    if (inputRank < 1 || inputRank > getData().Ranks.length || !inputRank) {
      $("#rankAdvanceAlert").addClass("text-danger");
      $("#rankAdvanceAlert").text("Invalid rank.");

      setTimeout(function() {
        $("#rankAdvanceAlert").text("");
      }, 1000);
    } else {
      $("#rankAdvanceConfirm + *").click();
      
      // Go through every mission in every rank and move all with Rank < rank to Completed.
      // Start with current, then just the numbered ranks.
      let clearRanks = ["Current", ...Object.keys(missionData).filter(r => r <= inputRank)];
      for (let clearRank of clearRanks) {  
        let rankData = missionData[clearRank].Remaining;
    
        for (let clearIndex = 0; clearIndex < rankData.length; clearIndex++) {
          let mission = rankData[clearIndex];
          
          if (mission.Rank < inputRank) {
            rankData.splice(clearIndex, 1);
            missionData.Completed.Remaining.push(mission);
            clearIndex -= 1;
          }
        }
      }
      
      // Now fill in Current
      for (let fillRank = inputRank;
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
  }
}

function focusRankSelectPrompt() {
  setTimeout(function() {
    $("#rank-main").focus();
    $("#rank-event").focus();
  }, 500);
}

function resetProgress() {
  removeLocal(currentMode, "Completed");
  removeLocal(currentMode, "FormValues");
  removeLocal(currentMode, "CompletionTimes");
  removeLocal(currentMode, getMissionEtasKey());
  initializeMissionData();
  renderMissions();
}

function resetAllProgress(){
  localStorage.clear();
  window.location.reload();
}

// getLocal, setLocal and removeLocal is a layer of abstraction that creates a key name based on the mode and given key.
// The "local" methods are intended for data specific to in instance of main or an event in a specific game.
function getLocal(mode, key) {
  return localStorage.getItem(`${getModeKey(mode)}-${key}`);
}

function setLocal(mode, key, value) {
  localStorage.setItem(`${getModeKey(mode)}-${key}`, value);
}

function removeLocal(mode, key) {
  localStorage.removeItem(`${getModeKey(mode)}-${key}`);
}

// The "global" methods are intended for things that are shared amongst every mode and game, like settings.
function getGlobal(key) {
  return localStorage.getItem(key);
}

function setGlobal(key, value) {
  localStorage.setItem(key, value);
}

function removeGlobal(key) {
  localStorage.removeItem(key);
}

// The "gameLocal" methods are intended for game-specific settings (like whether you were tracking main or an event last)
function getGameLocal(key) {
  return localStorage.getItem(`${GAME_SAVE_KEY_PREFIX}${key}`);
}

function setGameLocal(key, value) {
  localStorage.setItem(`${GAME_SAVE_KEY_PREFIX}${key}`, value);
}

function removeGameLocal(key) {
  localStorage.removeItem(`${GAME_SAVE_KEY_PREFIX}${key}`);
}

// returns "main" or "event-########" (with prefix) based on the mode and tracked event.
function getModeKey(mode) {
  if (mode == "event") {
    return `${GAME_SAVE_KEY_PREFIX}event-${eventScheduleInfo.EndTimeMillis}`;
  } else {
    return `${GAME_SAVE_KEY_PREFIX}${mode}`;
  }
}

function getData() {
  return DATA[currentMode];
}

/**** AB TEST STUFF ****/

// For any Experiments that the user is not in a group for, assign a default group
function initializeAbTestGroups() {
  // Get the test name (left half) from each current group and throw them into a set.
  let currentGroupIds = getCurrentAbTestGroups();
  let availableGroupMap = getAvailableAbTestGroups();
  let currentTests = new Set();
  let indicesToRemove = new Set();
  
  for (let currentGroupIdIndex in currentGroupIds) {
    let currentGroupId = currentGroupIds[currentGroupIdIndex];
    let currentTest = currentGroupId.split("|")[0];
    
    if (currentTest in availableGroupMap) {
      currentTests.add(currentTest);
    } else {
      // This is a saved Ab Test Group, but no longer available
      indicesToRemove.add(parseInt(currentGroupIdIndex));
    }
  }
  
  // Remove depricated ab test groups.
  currentGroupIds = currentGroupIds.filter((groupId, index) => !indicesToRemove.has(index));
  
  // Use that set to filter all known test names down to ones not yet assigned.
  let unassignedTestNames = Object.keys(availableGroupMap).filter(g => !currentTests.has(g));
  
  // Use the FIRST GROUP AS DEFAULT for each unassigned test.
  for (let testName of unassignedTestNames) {
    let defaultGroup = availableGroupMap[testName][0];
    currentGroupIds.push(`${testName}|${defaultGroup}`);
  }
  
  setCurrentAbTestGroups(currentGroupIds);
}

// Returns a map from test to groups (e.g., {"MissionTest": ["A","B"], "OtherTest": ["A","B","C"]})
function getAvailableAbTestGroups() {
  let groupMap = {};
  
  let allGroups = getData().Missions.filter(m => "AbTestConfig" in m)
                                       .map(m => m.AbTestConfig);
  let uniqueGroups = [...new Set(allGroups)];
  
  // Fill up the map by adding each unique groupId found in missions
  for (let groupId of uniqueGroups) {
    let splitId = groupId.split("|");
    let testName = splitId[0];
    let groupName = splitId[1];
    
    if (!(testName in groupMap)) {
      groupMap[testName] = [];
    }
    groupMap[testName].push(groupName);
  }
  
  // Sort the array at the end to ensure the order is right.
  // NOTE: This is a bit of a hack to avoid including the AbTestConfig.
  // It assumes that group names will be alphabetically ordered like A/B/C
  for (let groupArray of Object.values(groupMap)) {
    groupArray.sort();
  }
  
  return groupMap;
}

// Returns an array of the AB Test Groups the user is in
function getCurrentAbTestGroups() {
  let abTestGroups = getGameLocal("abTestGroups");
  if (abTestGroups) {
    return abTestGroups.split("||");
  } else {
    return [];
  }
}

// Saves an array of AB Test Groups to be the user's current groups.
function setCurrentAbTestGroups(groupArray) {
  // First update the save data
  let groupString = groupArray.join("||");
  setGameLocal("abTestGroups", groupString);
  
  // Now we have to fix our missionData data structure.
  let groupSet = new Set(groupArray);
  let currentMissions = getMissions();
  
  for (let key in missionData) {
    let rankGroup = missionData[key];
    if (typeof rankGroup !== "object" || !("Remaining" in rankGroup)) {
      continue;
    }
    
    for (let missionIndex in rankGroup.Remaining) {
      let mission = rankGroup.Remaining[missionIndex];
      // Any mission that's not in our current groups should be replaced with an equivalent one.
      if ("AbTestConfig" in mission && !groupSet.has(mission.AbTestConfig)) {
        let replacement = currentMissions.find(m => m.Id == mission.Id);
        rankGroup.Remaining[missionIndex] = replacement;
      }
    }
  }
}

// Returns all of the missions for the current mode, minus ones you're not in the group for.
function getMissions() {
  let abTestGroups = new Set(getCurrentAbTestGroups());
  let missions = getData().Missions.filter(m => !("AbTestConfig" in m) || abTestGroups.has(m.AbTestConfig));
  return missions;
}

// For a given mission id, determine the associated AB Test and switch to the next group
function switchToNextAbGroup(missionId) {
  let mission = getMissions().find(m => m.Id == missionId);
  if (!mission || !("AbTestConfig" in mission)) {
    console.log(`Cannot switch group for mission id "${missionId}"`);
    return false;
  }
  
  let testIdSplit = mission.AbTestConfig.split("|");
  let testName = testIdSplit[0];
  let groupName = testIdSplit[1];
  
  let groupsForTest = getAvailableAbTestGroups()[testName];
  let testGroupIndex = groupsForTest.indexOf(groupName);
  if (testGroupIndex == -1) {
    console.log(`Cannot switch group for mission id "${missionId}"`);
    return false;
  }
  
  // Switch to the next element in the array, looping around to 0 at the end.
  let newGroupName = groupsForTest[(testGroupIndex + 1) % groupsForTest.length];
  let newGroupId = `${testName}|${newGroupName}`;
  
  // Replace the old group id with the new one in its place.
  let currentGroupIds = getCurrentAbTestGroups();
  let oldGroupIndex = currentGroupIds.indexOf(mission.AbTestConfig);
  currentGroupIds[oldGroupIndex] = newGroupId;
  
  setCurrentAbTestGroups(currentGroupIds);
  renderMissions();
  
  return false; //  Return false to stop default '#' behavior on some browsers.
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
      let generator = getGenerator(condition.ConditionId);
      if (generator) {
        // A normal "Own Generator" mission
        industryId = generator.IndustryId;
      } else {
        // A stupid "Own Resource" mission
        industryId = getIndustryByResource(condition.ConditionId).Id;
      }
    } else if (conditionType == "IndustryUnlocked") {
      // Choose the industry to the left of the one to unlock.
      let unlockableIndustryIndex = getData().Industries.findIndex(i => i.Id == condition.ConditionId);
      industryId = getData().Industries[unlockableIndustryIndex - 1].Id;
    } else if (conditionType == "ResourcesEarnedSinceSubscription") {
      if (["scientist", "darkscience"].includes(condition.ConditionId.toLowerCase())) {
        // We currently don't support a calculator collecting science
        return "Mission type currently unsupported.  Check back next event!";
      }
      
      industryId = getIndustryByResource(condition.ConditionId).Id;
    }
    
    let resource = getResourceByIndustry(industryId);
    let imgDirectory = getImageDirectory();
    let wordForTrades = upperCaseFirstLetter(ENGLISH_MAP['conditionmodel.trade.plural']);
    
    // Display three tabs: one for generators, one for production researchers, one for trades. Then below, options and submit.
    let html = `
      <ul class="nav nav-tabs" id="calc-tabs" role="tablist">
        <li class="nav-item">
          <a class="nav-link active" id="generators-tab" data-toggle="tab" href="#generators" role="tab" aria-controls="generators" aria-selected="true"><div class="resourceIcon" style="background-image: url('${imgDirectory}/${resource.Id}.png');">&nbsp;</div> Generators</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" id="researchers-tab" data-toggle="tab" href="#researchers" role="tab" aria-controls="researchers" aria-selected="false"><div class="resourceIcon cardIcon">&nbsp;</div> ${ENGLISH_MAP['gachapurchaseconfirmation.content.panel.go_researchers.txt_name']}</a>
        </li>
        <li class="nav-item">
          <a class="nav-link" id="trades-tab" data-toggle="tab" href="#trades" role="tab" aria-controls="trades" aria-selected="false"><div class="resourceIcon comradesPerSec">&nbsp;</div> ${wordForTrades}</a>
        </li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="generators" role="tabpanel" aria-labelledby="generators-tab">${getGeneratorsTab(mission, industryId)}</div>
        <div class="tab-pane fade" id="researchers" role="tabpanel" aria-labelledby="researchers-tab">${getResearchersTab(mission, industryId)}</div>
        <div class="tab-pane fade" id="trades" role="tabpanel" aria-labelledby="trades-tab">${getTradesTab()}</div>
      </div>`;
    html += `<hr /><div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configAutobuy"><label class="form-check-label" for="configAutobuy">Auto-buy deepest generator</label>
      <a class="infoButton ml-1" tabindex="-1" role="button" data-toggle="popover" data-trigger="focus" data-content="Continuously buy max of the deepest available automated generator.">&#9432;</a></div>`;
    html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configOffline" onclick="clickOffline()"><label class="form-check-label" for="configOffline">Offline</label>
      <a class="infoButton ml-1" tabindex="-1" role="button" data-toggle="popover" data-trigger="focus" data-content="There appears to be an undocumented huge difference in the game's offline calculations, where it runs the deepest generator for the entire duration, followed by the second-deepest, etc., instead of repeating the process continuously.  This can make long offline periods optimal, but you cannot check in.">&#9432;</a></div>`;
    
    if (conditionType == "ResourceQuantity") {
      html += `<div class="form-check"><input class="form-check-input" type="checkbox" value="" id="configComradeLimited" onclick="clickComradeLimited('${condition.ConditionId}')"><label class="form-check-label" for="configComradeLimited">Limited by ${resourceName('comrade')} only</label>
        <a class="infoButton ml-1" tabindex="-1" role="button" data-toggle="popover" data-trigger="focus" data-content="Simplify and speed up calculation by assuming production is irrelevant.">&#9432;</a></div>`;
    }
    
    html += `<div class="form-inline"><label for="configMaxDays" id="configMaxDaysLabel" class="mr-2">Max Days:</label><input type="number" class="form-control w-25" min="1" value="1" id="configMaxDays" placeholder="Max Days"><a class="infoButton ml-2" tabindex="-1" role="button" data-toggle="popover" data-trigger="focus" data-content="Higher Max Days allows you to simulate further, but increases time when simulation doesn't succeed. The simulation will automatically stop after ten seconds if it has not yet finished (consider upgrading some researchers at this point.)">&#9432;</a></div>`;
    
    html += `<p><strong>Result:</strong> <span id="result"></span></p>`;
    html += `<input type="hidden" id="missionId" value="${mission.Id}"><input type="hidden" id="industryId" value="${industryId}">`;
    html += `<p><button id="calcButton" class="btn btn-primary" type="button" onclick="doProductionSim()" title="Run simulation to calculate ETA">Calculate!</button>`;
    html += `<button id="importButton" class="btn btn-primary float-right" type="button" onclick="importCounts()">Import Counts</button></p>`;
    
    return html;
  } else {
    return "Mission type currently unsupported.";
  }
}

function updateImportButton() {
  if ($('#allInfoPopup').hasClass('show')) {
    return; // Don't do anything if it's the all-industries popup.
  }
  
  let industryId = $('#industryId').val();
  if (!industryId) {
    return;
  }
  
  let resource = getResourceByIndustry(industryId);
  let formValues = getFormValuesObject();
  
  if (formValues.Counts[resource.Id] && formValues.Counts[resource.Id].TimeStamp) {
    let importDateString = getTimeStampLocaleString(formValues.Counts[resource.Id].TimeStamp);
    let importTitle = `Import ${resourceName(resource.Id)} data from ${importDateString}`;
    $('#importButton').prop('title', importTitle);
    $('#importButton').removeClass('collapse');
  } else {
    $('#importButton').addClass('collapse');
  }
}

function getAllIndustryPopup() {
  let resourceId = getData().Resources[0].Id;
  let wordForTrades = upperCaseFirstLetter(ENGLISH_MAP['conditionmodel.trade.plural']);
  
  // Display three tabs: one for generators, one for production researchers, one for trades. Then below, options and submit.
  return `
    <ul class="nav nav-tabs" id="calc-tabs" role="tablist">
      <li class="nav-item">
        <a class="nav-link" id="all-generators-tab" data-toggle="tab" href="#all-generators" role="tab" aria-controls="all-generators" aria-selected="false"><div class="resourceIcon" style="background-image: url('${getImageDirectory()}/${resourceId}.png');">&nbsp;</div> Generators</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="all-researchers-tab" data-toggle="tab" href="#all-researchers" role="tab" aria-controls="all-researchers" aria-selected="false"><div class="resourceIcon cardIcon">&nbsp;</div> ${ENGLISH_MAP['gachapurchaseconfirmation.content.panel.go_researchers.txt_name']}</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" id="all-trades-tab" data-toggle="tab" href="#all-trades" role="tab" aria-controls="all-trades" aria-selected="false"><div class="resourceIcon comradesPerSec">&nbsp;</div> ${wordForTrades}</a>
      </li>
    </ul>
    <div class="tab-content">
      <div class="tab-pane fade" id="all-generators" role="tabpanel" aria-labelledby="all-generators-tab">${getAllGeneratorsTab()}</div>
      <div class="tab-pane fade" id="all-researchers" role="tabpanel" aria-labelledby="all-researchers-tab">${getResearchersTab()}</div>
      <div class="tab-pane fade" id="all-trades" role="tabpanel" aria-labelledby="all-trades-tab">${getTradesTab()}</div>
    </div>`;
}

// Returns html for the calculator's sub-tab where you input generator and resource counts.
function getGeneratorsTab(mission, industryId) {
  let html = "";
  
  let imgDirectory = getImageDirectory();
  let formValues = getFormValuesObject();
  let researchers = getResearchersByIndustry(industryId);
  
  // Make the generators' input boxes
  let generators = getData().Generators.filter(g => g.IndustryId == industryId);
  for (let generator of generators) {
    let id = generator.Id;
    let name = resourceName(id);
    let popoverTitle = `<img class='resourceIcon mr-1' src='${imgDirectory}/${id}.png'>${name}`;
    let popoverBody = describeGenerator(generator, researchers, formValues);
    
    html += getResourceInput(`${id}-count`, `# of ${name}`, `${imgDirectory}/${id}.png`, name, "", "", "", popoverTitle, popoverBody);
  }
  
  // Make the resources' input boxes
  html += "<hr />";
  
  let resource = getResourceByIndustry(industryId);
  let resourceNameString = resourceName(resource.Id);
  html += getResourceInput("resources", `# of ${resourceNameString}`, `${imgDirectory}/${resource.Id}.png`, `# of ${resourceNameString}`);
  
  if (mission.Condition.ConditionType == "ResourcesEarnedSinceSubscription") {
    html += getResourceInput("resourceProgress", "Mission Progress", `${imgDirectory}/${resource.Id}.png`, `${resourceNameString} (Mission Progress)`);
  }
  
  // Make the comrades' input boxes
  html += "<hr />";
  
  let cpsDefaultValue = formValues.Trades.TotalComrades || "";
  html += getResourceInput("comrades", `# of ${resourceName('comrade')}`, `${imgDirectory}/comrade.png`, `# of ${resourceName('comrade')}`);
  html += getResourceInput("comradesPerSec", `${resourceName('comrade')}/second`, "img/shared/comrades_per_second.png", `${resourceName('comrade')} Per Second`, cpsDefaultValue);
  
  return html;
}

// Returns html for a tab containing information on Generators for all industries
function getAllGeneratorsTab() {
  let imgDirectory = getImageDirectory();
  let formValues = getFormValuesObject();
  
  let html = "";
  
  for (let industry of getData().Industries) {
    if (industry != getData().Industries[0]) {
      html += "<hr />";
    } else {
      html += "<div class='mt-3'></div>"; // Start the first group a bit lower
    }
    
    let researchers = getResearchersByIndustry(industry.Id);
    let resource = getResourceByIndustry(industry.Id);
    let resourceNameString = resourceName(resource.Id);
    
    // Show the industry name if it isn't the resource.
    let industryName = ENGLISH_MAP[industry.Id];
    let singularResouceName = resourceName(resource.Id, false);
    if (industryName.toLowerCase() != singularResouceName.toLowerCase()) {
      resourceNameString += ` <em>(${industryName})</em>`;
    }
    
    html += `<div class="font-weight-bold mb-2"><img class='resourceIcon mr-1' src='${imgDirectory}/${resource.Id}.png'>${resourceNameString}</div>`;
    
    let generators = getData().Generators.filter(g => g.IndustryId == industry.Id);
    for (let generator of generators) {
      let id = generator.Id;
      let name = resourceName(id);
      let popoverTitle = `<img class='resourceIcon mr-1' src='${imgDirectory}/${id}.png'>${name}`;
      let popoverBody = describeGenerator(generator, researchers, formValues);
      
      html += `<div><a id="${id}-count-popover-link" class="infoButton" tabindex="-1" role="button" data-toggle="popover" data-placement="right" data-trigger="focus" data-title="${popoverTitle}" data-content="${popoverBody}" data-html="true"><span class="researcherName">${popoverTitle}</span></a></div>`;
    }
  }
  
  return html;
}

function updateGeneratorsTab() {
  let formValues = getFormValuesObject();
  let researchers = getData().Researchers;
  let generators = getData().Generators.slice(1); // skip comrade generator
  let industryId = "";
  
  if ($('#infoPopup').hasClass('show')) {
    industryId = $('#industryId').val();
    researchers = getResearchersByIndustry(industryId);
    generators = generators.filter(g => g.IndustryId == industryId);
  }
  
  for (let generator of generators) {
    $(`#${generator.Id}-count-popover-link`).attr('data-content', describeGenerator(generator, researchers, formValues));
  }
}

// Returns a div for a single input in the Generators tab.
function getResourceInput(tagId, description, imageUrl, imageTitle, defaultValue = "", extraInputClasses = "", extraInputProperties = "", popoverTitle = "", popoverHtml = "") {
  let preSpanHtml = "";
  let postSpanHtml = "";
  let tradeDeltaButtons = "";
  
  if (popoverHtml) {
    preSpanHtml = `<a id="${tagId}-popover-link" class="infoButton" tabindex="-1" role="button" data-toggle="popover" data-placement="right" data-trigger="focus" data-title="${popoverTitle}" data-content="${popoverHtml}" data-html="true" title="${imageTitle}">`;
    postSpanHtml = `</a>`;
  }

  // Trade up/down button implementation. Trade name is queried based on positional value in tagId.
  if (tagId.indexOf("trade") !== -1) {
    let tradeName = tagId.substr(0, tagId.indexOf("-"));
    tradeDeltaButtons = `<div id="${tradeName}-buttons" class="tradeLevelButtonGroup">
      <div id="${tradeName}-up-button" class="tradeLevelButton float-left text-success">
        <a onclick="tradeLevelDelta('${tradeName}', 1)" role="button" title="Increase ${resourceName(tradeName, false)} trade">&#x25B2;</a>
      </div>
      <div id="${tradeName}-down-button" class="tradeLevelButton float-right text-danger">
        <a onclick="tradeLevelDelta('${tradeName}', -1)" role="button" title="Decrease ${resourceName(tradeName, false)} trade">&#x25BC;</a>
      </div>
    </div>`;
  }

  return `<div class="input-group my-1" >
            <div class="input-group-prepend" title="${imageTitle}">
              ${preSpanHtml}
              <span class="input-group-text inputIcon" style="background-image: url('${imageUrl}');">&nbsp;</span>
              ${postSpanHtml}
            </div>
            <input type="text" class="form-control ${extraInputClasses}" id="${tagId}" value="${defaultValue}" placeholder="${description}" ${extraInputProperties}>
            ${tradeDeltaButtons}
          </div>`;
}

// Returns a long-form html description of the generator, adjusted to researcher levels.  Will not contain "
function describeGenerator(generator, researchers, formValues) {
  let html = "";  
  let imgDirectory = getImageDirectory();
  
  let genValues = getDerivedResearcherValues(generator, researchers, formValues);
  
  html += `<strong>Costs:</strong><br />`;
  
  let costs = generator.Cost.map(c => ({ Resource: c.Resource.toLowerCase(), Qty: Number(c.Qty) }));
  for (let cost of costs) {
    if (cost.Resource != "comrade") {
      cost.Qty /= genValues.CostReduction;
    }
    html += `<span class='mx-1'><img class='resourceIcon mr-1' src='${imgDirectory}/${cost.Resource}.png' title='${resourceName(cost.Resource)}'>${bigNum(cost.Qty)}</span>`;
  }
  
  html += `<br /><br /><strong>Generates:</strong><br />`;
  
  genValues.Speed = genValues.Speed || 1;
  let genTime = generator.BaseCompletionTime / genValues.Speed;
  
  let qtyProduced = generator.Generate.Qty * genValues.Power;
  html += `<img class='resourceIcon mr-1' src='${imgDirectory}/${generator.Generate.Resource}.png' title='${resourceName(generator.Generate.Resource)}'>${shortBigNum(qtyProduced)} `;
  html += `per <img class='resourceIcon mx-1' src='img/shared/speed.png'>${getEta(genTime)}<div class='my-3'></div>`;
  
  html += `<img class='resourceIcon mr-1' src='img/shared/boost_power.png' title='Power'>x${shortBigNum(genValues.Power)} `;
  html += `<img class='resourceIcon mx-1' src='img/shared/discount.png' title='Power'>x${shortBigNum(genValues.CostReduction)} `;
  html += `<img class='resourceIcon mx-1' src='img/shared/speed.png' title='Power'>x${shortBigNum(genValues.Speed)}<div class='my-1'></div>`;
  html += `<img class='resourceIcon mr-1' src='img/shared/crit_chance.png' title='Crit Chance'>${shortBigNum(genValues.CritChance * 100)}% `;
  html += `<img class='resourceIcon mx-1' src='img/shared/crit_power.png' title='Crit Power'>x${shortBigNum(genValues.CritPower)}<div class='my-3'></div>`;
  
  let totalPerSec = qtyProduced * (genValues.CritChance * genValues.CritPower + 1 - genValues.CritChance) / genTime;
  if (totalPerSec < 1e4) {
    totalPerSec = totalPerSec.toPrecision(3);
  }
  html += `Each Outputs: <img class='resourceIcon mr-1' src='${imgDirectory}/${generator.Generate.Resource}.png' title='${resourceName(generator.Generate.Resource)}'>${shortBigNum(totalPerSec)}/sec`;
  
  let industry = getData().Industries.find(i => i.Id == generator.IndustryId);
  if (generator.Unlock.Threshold > 0 || industry.UnlockCostResourceQty > 0) {
    html += `<br /><br /><strong>Unlocks at:</strong><br />`;
    if (generator.Unlock.Threshold > 0 && generator.Unlock.ConditionType != "IndustryUnlocked") {
      html += `<img class='resourceIcon mr-1' src='${imgDirectory}/${generator.Unlock.ConditionId}.png' title='${resourceName(generator.Unlock.ConditionId)}'>${bigNum(generator.Unlock.Threshold)}`;
    } else {
      html += `<img class='resourceIcon mr-1' src='${imgDirectory}/${industry.UnlockCostResourceId.toLowerCase()}.png' title='${resourceName(industry.UnlockCostResourceId.toLowerCase())}'>${bigNum(industry.UnlockCostResourceQty)}`;
    }
  }
  
  html += `<br /><br /><strong>Automator:</strong><br />`;
  
  let autoResearcher = getData().Researchers.find(r => r.ModType == "GenManagerAndSpeedMult" && r.TargetIds[0] == generator.Id);
  html += `<div class='resourceIcon cardIcon mr-1'>&nbsp;</div>${researcherName(autoResearcher)}<br />`;
  html += getResearcherFullDetailsHtml(autoResearcher);
  
  return html;
}

function getFirstMissionWithScriptedReward(researcher) {
  // Start by efficiently caching the id of every scripted gacha that rewards the researcher.
  gachasWithReward = new Set();
  
  for (let script of getData().GachaScripts) {
    if (script.Card.some(card => card.Id == researcher.Id)) {
      gachasWithReward.add(script.GachaId);
    }
  }
  
  return getMissions().find(m => gachasWithReward.has(m.Reward.RewardId));
}

// Returns html for the researchers sub-tab where you input researcher levels.
function getResearchersTab(mission, industryId) {
  let html = `
    <div class="container">
      <div class="row">`;
  
  let formValues = getFormValuesObject();
  
  let researchers = getResearchersByIndustry(industryId);
  sortResearchers(researchers);
  
  // This is a huge hack until I figure out a better, more responsive way of handling this.
  // If innerWidth is too small (e.g., a phone) only do two columns per row.
  let columnsPerRow = (window.innerWidth > 450) ? 3 : 2;
  
  // Make rows with 2-3 researchers per row and end each one with a row-ending div.
  let columnsLeft = columnsPerRow;  
  for (let researcher of researchers) {
    html += `<div class="col mt-3">${getResearcherCard(researcher, formValues)}</div>`;
    
    if (columnsLeft == 1) {
      html += '<div class="w-100"></div>';
      columnsLeft = columnsPerRow;
    } else {
      columnsLeft -= 1;
    }
  }
  
  // Add an additional PropagandaBoost pseudo-researcher.
  html += `<div id="propBoostCol" class="col mt-3">${getPropagandaBoostCard(formValues)}</div>`;
  columnsLeft -= 1;
  
  // Finish out the columns to be a multiple of columnsPerRow
  if (columnsLeft != 0) {
    html += '<div class="col mt-1"></div>'.repeat(columnsLeft);
  }
  
   html += `
      </div>
    </div>`;
  return html;
}

// Maybe find a better way to do this at some point?
function updateTabResearcher(researcher) {
  let level = getFormValuesObject().ResearcherLevels[researcher.Id] || 0;  
  
  let researcherValue = getValueForResearcherLevel(researcher, level);
  let valueString = "";
  if (level != 0) {
    if (researcher.ExpoMultiplier) {
      valueString = `x${shortBigNum(researcherValue)}`;
    } else {
      valueString = `${shortBigNum(researcherValue * 100)}%`;
    }
  }
  
  // -1 is a special case for level meaning "custom value"
  // Custom values get an emphasis
  let levelString = `Level ${level}`;
  if (level == -1) {
    valueString = `<strong>${valueString}</strong>`;
    levelString = "Custom";
  }
  
  let downVisibilityClass = (level <= -1) ? "invisible" : "visible";
  let downColorClass, downTitle, downLabel;
  if (level > 0) {
    // Red down arrow for decreasing researcher level.
    downColorClass = "text-danger";
    downTitle = `Level ${researcherName(researcher)} down to ${level - 1}`;
    downLabel = "&#x25BC;";
  } else {
    // Yellow '#' for setting a specific researcher value
    downColorClass = "text-warning";
    downTitle = "Set custom value (esp. for manual running)";
    downLabel = "#";
  }
  
  let downHtml = `<a onclick="clickLevelResearcher('${researcher.Id}', ${level - 1})" role="button" title="${downTitle}" class="${downColorClass}">${downLabel}</a>`;
  
  let maxLevel = getData().ResearcherRankCosts.find(cost => cost.Rarity == researcher.Rarity).Quantity.length + 1;
  let upVisibilityClass = (level >= maxLevel) ? "invisible" : "visible";
  let upHtml = `<a onclick="clickLevelResearcher('${researcher.Id}', ${level + 1})" role="button" title="Level ${researcherName(researcher)} up to ${level + 1}">&#x25B2;</a>`;
  
  $(`.modal.show #${researcher.Id}-level`).html(levelString);
  $(`.modal.show #${researcher.Id}-value`).html(valueString);
  $(`.modal.show #${researcher.Id}-down-button`).removeClass("visible invisible").addClass(downVisibilityClass).html(downHtml);
  $(`.modal.show #${researcher.Id}-up-button`).removeClass("visible invisible").addClass(upVisibilityClass).html(upHtml);
}

// Sorts the given array in-place to match the in-game ordering
function sortResearchers(researchers) {
  let RARITY_ORDER = [
    'Common', 'Rare', 'Epic', 'Event', 'Supreme',
    
    'LteCommon', 'LteRare'
  ];
  
  let MOD_TYPE_ORDER = [
    'GenManagerAndSpeedMult', 'GeneratorPayoutMultiplier', 'GeneratorCostReduction',
    'GeneratorCritChance', 'GeneratorCritPowerMult', 'TradePayoutMultiplier'
  ];
  
  // Map the strings to their positions to cache them for lookup
  let rarityMap = new Map(RARITY_ORDER.map((value, index) => [value, index]));
  let modTypeMap = new Map(MOD_TYPE_ORDER.map((value, index) => [value, index]));
  let industryMap = getResearcherIndustrySortOrderMap();
  let generatorMap = new Map(getData().Generators.map((gen, index) => [gen.Id, index]));
  
  // Sort by rarity first, then mod type, then finally by id (just in case)
  // I think the orders listed above are what the game uses, but may take some tuning.
  researchers.sort((left, right) => {
    if (left.Rarity != right.Rarity) {
      return rarityMap.get(left.Rarity) - rarityMap.get(right.Rarity);
      
    } else if (industryMap.get(left.TargetIds[0]) != industryMap.get(right.TargetIds[0])) {
      return industryMap.get(left.TargetIds[0]) - industryMap.get(right.TargetIds[0]);
    
    } else if (left.ModType != right.ModType) {
      return modTypeMap.get(left.ModType) - modTypeMap.get(right.ModType);
      
    } else if (generatorMap.get(left.TargetIds[0]) != generatorMap.get(right.TargetIds[0])) {
      return generatorMap.get(left.TargetIds[0]) - generatorMap.get(right.TargetIds[0]);
      
    }  else {
      return left.Id.localeCompare(right.Id);
    }
  });
}

// A map of each TargetId (industry/generator/resource) to its industry's index
var cachedIndustryMap = null;
function getResearcherIndustrySortOrderMap() {
  if (cachedIndustryMap) {
    return cachedIndustryMap;
  }
  
  cachedIndustryMap = new Map(getData().Industries.map((industry, index) => [industry.Id, index]));
  
  getData().Industries.forEach( (industry, index) => {
    cachedIndustryMap.set(getData().Resources[index].Id, index); // assumes Industries[N] corresponds to Resources[N]
  });
  
  getData().Generators.forEach( generator => {
    cachedIndustryMap.set(generator.Id, cachedIndustryMap.get(generator.IndustryId));
  });
  
  return cachedIndustryMap;
}

// Returns the html for the contents of a researcher's cell in the grid.
function getResearcherCard(researcher, formValues) {
  let imgDirectory = getImageDirectory();
  let rarityClass = `researcher${researcher.Rarity}`;
  let targetIconUrl = getResearcherTargetIconUrl(researcher);
  
  let level = formValues.ResearcherLevels[researcher.Id] || 0;
  let researcherValue = getValueForResearcherLevel(researcher, level);
  let valueString = "";
  
  if (level != 0) {
    if (researcher.ExpoMultiplier) {
      valueString = `x${shortBigNum(researcherValue)}`;
    } else {
      valueString = `${shortBigNum(researcherValue * 100)}%`;
    }
  }
  
  // -1 is a special case for level meaning "custom value."
  // Custom values get an emphasis
  let levelString = `Level ${level}`;
  if (level == -1) {
    valueString = `<strong>${valueString}</strong>`;
    levelString = "Custom";
  }
  
  let downVisibilityClass = (level <= -1) ? "invisible" : "visible";
  let downColorClass, downTitle, downLabel;
  if (level > 0) {
    // Red down arrow for decreasing researcher level.
    downColorClass = "text-danger";
    downTitle = `Level ${researcherName(researcher)} down to ${level - 1}`;
    downLabel = "&#x25BC;";
  } else {
    // Yellow '#' for setting a specific researcher value
    downColorClass = "text-warning";
    downTitle = "Set custom value (esp. for manual running)";
    downLabel = "#";
  }
  
  let maxLevel = getData().ResearcherRankCosts.find(cost => cost.Rarity == researcher.Rarity).Quantity.length + 1;
  let upVisibilityClass = (level >= maxLevel) ? "invisible" : "visible";
  
  let popupTitle = researcherName(researcher);
  let popupBody = getResearcherFullDetailsHtml(researcher);
  
  return `
    <a tabindex="0" class="researcherName" role="button" data-toggle="popover" data-placement="top" data-trigger="focus" data-title="${popupTitle}" data-content="${popupBody}" data-html="true">
      <div class="researcherCard ${rarityClass} mx-auto" style="background-image: url('${imgDirectory}/${researcher.Id}.png');">
        <div class="researcherIcon float-right" style="background-image: url('${targetIconUrl}');">&nbsp;</div>
        <div id="${researcher.Id}-level" class="researcherLevel text-center">${levelString}</div>
      </div>
    </a>

    <div class="my-2 text-center">
      <div id="${researcher.Id}-down-button" class="${downVisibilityClass} float-left researcherLevelButton ${downColorClass}">
        <a onclick="clickLevelResearcher('${researcher.Id}', ${level - 1})" role="button" title="${downTitle}">${downLabel}</a>
      </div>
      
      
      <div class="resourceIcon ${researcher.ModType}">&nbsp;</div>
      <span id="${researcher.Id}-value">${valueString}</span>
      
      <div id="${researcher.Id}-up-button" class="${upVisibilityClass} researcherLevelButton float-right text-success">
        <a onclick="clickLevelResearcher('${researcher.Id}', ${level + 1})" role="button" title="Level ${researcherName(researcher)} up to ${level + 1}">&#x25B2;</a>
      </div>
    </div>`;
}

function getPropagandaBoostCard(formValues) {
  let level = formValues.ResearcherLevels.PropagandaBoost || 0;
  
  let imgDirectory = getImageDirectory();
  let backgroundImageUrl = (level == 0) ? "img/shared/propaganda_boost_off.png" : `${imgDirectory}/propaganda_boost_on.png`;
  let targetIconUrl = `${imgDirectory}/multi-industry.png`;
  
  let levelText = (level == 0) ? "Inactive" : "Active";
  let valueString = (level == 0) ? "" : "x2";
  
  let downVisibilityClass = (level <= 0) ? "invisible" : "visible";
  let upVisibilityClass = (level >= 1) ? "invisible" : "visible";
  
  return `
    <a tabindex="0" class="researcherName" role="button" data-toggle="popover" data-placement="top" data-trigger="focus" data-title="Propaganda Boost" data-content="Watch ads to boost the output of all generators by 2x" data-html="true">
      <div class="researcherCard propagandaBoost mx-auto" style="background-image: url('${backgroundImageUrl}');">
        <div class="researcherIcon float-right" style="background-image: url('${targetIconUrl}');">&nbsp;</div>
        <div class="researcherLevel text-center">${levelText}</div>
      </div>

      <div class="my-2 text-center">
        <div class="${downVisibilityClass} float-left researcherLevelButton text-danger">
          <a onclick="clickChangePropagandaBoost(0)" role="button" title="Disable Propaganda Boost">&#x25BC;</a>
        </div>
        
        
        <div class="resourceIcon power">&nbsp;</div>
        ${valueString}
        
        <div class="${upVisibilityClass} researcherLevelButton float-right text-success">
          <a onclick="clickChangePropagandaBoost(1)" role="button" title="Enable Propaganda Boost">&#x25B2;</a>
        </div>
      </div>
    </a>`;
}

// Returns the multiplier (>1x) or chance (0-1) given a researcher and their level.  If level is -1, the user's override is returned.
function getValueForResearcherLevel(researcher, level) {
  if (!level) {
    if (researcher.ExpoMultiplier && researcher.ModType != "GenManagerAndSpeedMult") {
      // Multiplicative researchers default to 1x.  Commons are an exception since you get no production without.
      return 1;
    } else {
      return 0;
    }
  }
  
  if (level == -1) {
    // This is a special case that indicates a custom value.
    return getFormValuesObject().ResearcherOverrides[researcher.Id];
  } else if (researcher.ExpoMultiplier) {
    // It's exponential
    return researcher.ExpoMultiplier * Math.pow(researcher.ExpoGrowth, level);
  } else {
    // It's quadratic
    return researcher.BasePower + level * researcher.CurveModifier + level * level * researcher.UpgradePower;
  }
}

// Returns  the multiplier (1x) or chance (0-1) given a researcher and formValues containing its level.
function getValueForResearcherWithForm(researcher, formValues) {
  return getValueForResearcherLevel(researcher, formValues.ResearcherLevels[researcher.Id]);
}

// Called when the level down/up buttons are clicked
function clickLevelResearcher(researcherId, newLevelValue) {
  let researcher = getData().Researchers.find(r => r.Id == researcherId);
  
  let formValues = getFormValuesObject();
  formValues.ResearcherLevels[researcherId] = newLevelValue;
  formValues.ResearcherOverrides = formValues.ResearcherOverrides || {}; // This may not exist in older saves.
  
  // -1 is a special case meaning "custom value"
  if (newLevelValue == -1) {
    let commonAddendum = "";
    if (researcher.Rarity == "Common" || researcher.Rarity == "LteCommon") {
      commonAddendum = "\n(Setting a Common to 1 simulates constantly running it manually, 0.5 half the time, etc)";
    }
  
    let previousOverride = formValues.ResearcherOverrides[researcherId] || "";
    
    let customValue = prompt(`Enter custom value for ${researcherName(researcher)}.${commonAddendum}`, previousOverride);
    
    let customFloat = parseFloat(customValue);
    if (!customValue || !customFloat) {
      // User has entered a empty/invalid value, or cancelled, let's just return without saving changes.
      return;
    }
    
    formValues.ResearcherOverrides[researcherId] = customFloat;
  }
  
  saveFormValues(formValues);
  
  if (researcher && researcher.ModType == "TradePayoutMultiplier") {
    updateTradeTabTotals(researcher);
  } else {
    updateTabResearcher(researcher);
    updateGeneratorsTab();
  }
}

function clickChangePropagandaBoost(newLevelValue) {
  let formValues = getFormValuesObject();
  formValues.ResearcherLevels['PropagandaBoost'] = newLevelValue;
  saveFormValues(formValues);
  
  $(`.modal.show #propBoostCol`).html(getPropagandaBoostCard(formValues));
  updateGeneratorsTab();
}

// Returns the url of an icon representing the target of the researcher
function getResearcherTargetIconUrl(researcher) {
  let imgDirectory = getImageDirectory();
  let targetId = researcher.TargetIds[0];
  
  if (targetId.includes(',')) {
    // This has multiple targets, so we'll show a generic multitarget icon
    return `${imgDirectory}/multi-industry.png`;
  }
  
  // If there is a single targetId, it will depend on the ModType
  switch (researcher.ModType) {
    case "TradePayoutMultiplier":
    case "GenManagerAndSpeedMult": {
      //  targetId is a resourceId (trades) or generatorId (speed)
      return `${imgDirectory}/${targetId}.png`;
    }
    
    case "GeneratorCostReduction":
    case "GeneratorCritChance":
    case "GeneratorCritPowerMult": {
      // targetId is an industryId, use its resource as the icon
      let resourceId = getResourceByIndustry(targetId).Id;
      return `${imgDirectory}/${resourceId}.png`;
    }
    
    case "GeneratorPayoutMultiplier": {
      // targetId is either a generator like "farmer" or an industry like "Farming" (case-insensitive :/)
      if (getData().Industries.map(i => i.Id.toLowerCase()).includes(targetId.toLowerCase())) {
        // This is an industry, use its resource as the icon.
        let resourceId = getResourceByIndustry(targetId).Id;
        return `${imgDirectory}/${resourceId}.png`;
      
      } else {
        return `${imgDirectory}/${targetId}.png`;
      }
    }
  }
}

// Returns every root.Researchers object that affects generators (not trades) from the given industryId (or all if null)
function getResearchersByIndustry(industryId) {
  let generators = getData().Generators;
  let industryIds = [];
  
  if (industryId) {
    generators = generators.filter(g => g.IndustryId == industryId);
    industryIds = [industryId];
  } else {
    industryIds = getData().Industries.map(i => i.Id.toLowerCase());
  }
  
  let generatorIds = generators.map(g => g.Id.toLowerCase());
  let resourceIds = industryIds.map(id => getResourceByIndustry(id).Id.toLowerCase());
  
  let idWhitelist = new Set([...industryIds, ...resourceIds, ...generatorIds]);
  
  return getData().Researchers.filter( researcher => {
    // Ignore trade researchers
    if (researcher.ModType == "TradePayoutMultiplier") {
      return false;
    }

    // TargetIds is always a 1-element array with an industry/resource/generatorId,
    //   or a list of them separated by "," or ", ".  Also appears to be case-insensitive :(
    let targetIds = researcher.TargetIds[0].toLowerCase().split(/, ?/);
    return targetIds.some(targetId => idWhitelist.has(targetId));
  });
}

function getTradesTab() {
  let imgDirectory = getImageDirectory();
  let formValues = getFormValuesObject();

  let html = `
  <div class="container-fluid mt-2 mb-1">
    <div class="justify-content-center align-self-center text-center">
      <div class="resourceIcon comradesPerSec">&nbsp;</div> <strong id="totalDerivedComrades">${bigNum(formValues.Trades.TotalComrades || 0)}</strong>/sec
    </div>
  </div>`;
  
  let industryTrades = getIndustryTradeBreakdown(formValues);
  for (let industryTrade of industryTrades) {
    let inputId = `${industryTrade.ResourceId}-trade-cost`;
    let inputName = resourceName(industryTrade.ResourceId);
    let inputDescription = `Next ${ENGLISH_MAP['conditionmodel.trade.singular']} cost (${inputName})`;
    let iconUrl = `${imgDirectory}/${industryTrade.ResourceId}.png`;
    let extraClasses = (industryTrade.IsInvalid) ? "is-invalid" : "";
    let extraProperties = `onchange="updateTradeTabTotals();"`;
    let input = getResourceInput(inputId, inputDescription, iconUrl, inputDescription, industryTrade.NextCost, extraClasses, extraProperties);
    
    html += `
      <div class="container-fluid">
        <div class="row">
          <div class="col-5">${input}</div>
          <div id="${industryTrade.ResourceId}-formula" class="col-3 justify-content-center align-self-center">${industryTrade.FormulaHtml}</div>
          <div id="${industryTrade.ResourceId}-total" class="col-4 justify-content-center align-self-center">${industryTrade.TotalHtml}</div>
        </div>
      </div>`;
  }
  
  html += `
    <hr />
    <div class="container">
      <div class="row">`;
  
  let researchers = getData().Researchers.filter(r => r.ModType == "TradePayoutMultiplier");
  sortResearchers(researchers);
  
  // This is a huge hack until I figure out a better, more responsive way of handling this.
  // If innerWidth is too small (e.g., a phone) only do two columns per row.
  let columnsPerRow = (window.innerWidth > 450) ? 3 : 2;
  
  // Make rows with 2-3 researchers per row and end each one with a row-ending div.
  let columnsLeft = columnsPerRow;  
  for (let researcher of researchers) {
    html += `<div class="col mt-3">${getResearcherCard(researcher, formValues)}</div>`;
    
    if (columnsLeft == 1) {
      html += '<div class="w-100"></div>';
      columnsLeft = columnsPerRow;
    } else {
      columnsLeft -= 1;
    }
  }
  
  // Finish out the columns to be a multiple of columnsPerRow
  if (columnsLeft != columnsPerRow) {
    html += '<div class="col mt-1"></div>'.repeat(columnsLeft);
  }
  
   html += `
      </div>
    </div>`;
    
  return html;
}

// Adjusts the trade level based on the DOM input.
function tradeLevelDelta(tradeId, delta) {
  let inputToBigNum = fromBigNum($(`#${tradeId}-trade-cost`).val()) || Number($(`#${tradeId}-trade-cost`).val());
  let tradeInfo = getData().Trades.find(t => t.Resource == tradeId);
  
  let originalTradeCount = getTradesForCost(inputToBigNum, tradeInfo);
  let newTradeCount = originalTradeCount + delta;
  // I hope this doesn't result in any floating-point issues ...
  let newWriteValue = tradeInfo['CostMultiplier'] * Math.pow(tradeInfo['CostExponent'], newTradeCount);

  if (newTradeCount < 0 || newWriteValue === Infinity || isNaN(newWriteValue)) {
    return null;
  } else {
    $(`.modal.show #${tradeId}-trade-cost`).val(bigNum(newWriteValue));
    updateTradeTabTotals();
  }
}

// Called when an input for next trade cost changes, or if a researcher is given, when its level changes
function updateTradeTabTotals(researcher = null) {
  let formValues = getFormValuesObject();
  
  for (let industry of getData().Industries) {
    let resourceId = getResourceByIndustry(industry.Id).Id;
    let costString = $(`.modal.show #${resourceId}-trade-cost`).val();
    updateTradesForResource(resourceId, costString, formValues);
  }
  
  // If there are no invalid trades, update the total, including a base 1 cps.
  let allTrades = Object.values(formValues.Trades.Resource);
  if (!allTrades.find(t => t.IsInvalid)) {
    formValues.Trades.TotalComrades = allTrades.reduce((sum, t) => sum += (t.TotalComrades || 0), 1);
  }
  
  saveFormValues(formValues);
  
  // Fill in values in the trade tab.
  $('.modal.show #totalDerivedComrades').text(bigNum(formValues.Trades.TotalComrades));
  
  let industryTrades = getIndustryTradeBreakdown(formValues);
  for (let industryTrade of industryTrades) {
    let costElement = $(`.modal.show #${industryTrade.ResourceId}-trade-cost`).val(industryTrade.NextCost);
    if (industryTrade.IsInvalid) {
      costElement.addClass("is-invalid");
    } else {
      costElement.removeClass("is-invalid");
    }
    
    $(`.modal.show #${industryTrade.ResourceId}-formula`).html(industryTrade.FormulaHtml);
    $(`.modal.show #${industryTrade.ResourceId}-total`).html(industryTrade.TotalHtml);
  }
  
  if (researcher) {
    updateTabResearcher(researcher);
  }
  
  // Changing your CPS will erase any previous override.
  $('#comradesPerSec').val(formValues.Trades.TotalComrades);
}

function getIndustryTradeBreakdown(formValues) {
  let industryTrades = [];
  
  for (let industry of getData().Industries) {
    let resource = getResourceByIndustry(industry.Id);
    
    let formTrades = formValues.Trades.Resource[resource.Id];
    if (!formTrades) {
      let tradeInfo = getData().Trades.find(t => t.Resource == resource.Id);
      let comradesPerTrade = getTotalTradeValueForResource(resource.Id, formValues, tradeInfo);
      
      formTrades = {
        NextCost: "",
        Count: 0,
        ComradesPerTrade: comradesPerTrade,
        TotalComrades: 0,
        IsInvalid: false
      };
    }
    
    let percentTotal = Math.round(formTrades.TotalComrades / formValues.Trades.TotalComrades * 100) || 0;
    
    industryTrades.push({
      ResourceId: resource.Id,
      IsInvalid: formTrades.IsInvalid,
      NextCost: formTrades.NextCost,
      FormulaHtml: `<strong>${formTrades.Count}</strong> x ${shortBigNum(formTrades.ComradesPerTrade)}`,
      TotalHtml: `${shortBigNum(formTrades.TotalComrades)} (${percentTotal}%)`
    });
  }
  
  return industryTrades;
}

// Called when the inputs for next trade cost are changed
function updateTradesForResource(resourceId, costString, formValues) {
  let cost = fromBigNum(costString) || Number(costString);
  
  let tradeInfo = getData().Trades.find(t => t.Resource == resourceId);
  let comradesPerTrade = getTotalTradeValueForResource(resourceId, formValues, tradeInfo);
  let tradeCount = getTradesForCost(cost, tradeInfo);
  
  if (isNaN(tradeCount)) {
    formValues.Trades.Resource[resourceId] = {
      NextCost: costString,
      Count: 0,
      ComradesPerTrade: comradesPerTrade,
      TotalComrades: 0,
      IsInvalid: true
    };
  } else {
    formValues.Trades.Resource[resourceId] = {
      NextCost: bigNum(cost), // Normalize it
      Count: tradeCount,
      ComradesPerTrade: comradesPerTrade,
      TotalComrades: tradeCount * comradesPerTrade,
      IsInvalid: false
    };
  }
}


// Returns the number of comrades per trade for a given industry based on researcher levels.
function getTotalTradeValueForResource(resourceId, formValues, tradeInfo) {
  let totalMultiplier = 1;
  
  for (let researcher of getData().Researchers) {
    if (researcher.ModType == "TradePayoutMultiplier" && 
        researcher.TargetIds[0].split(/, ?/).includes(resourceId)) {
    
      totalMultiplier *= getValueForResearcherWithForm(researcher, formValues);
    }
  }
  
  return totalMultiplier * tradeInfo.ComradeAdd;
}

// Returns the number of trades associated with a given cost
function getTradesForCost(cost, tradeInfo) {
  if (isNaN(cost)) {
    return NaN;
  } else if (cost == "") {
    return 0;
  }
  
  let tradeCount = Math.log(cost / tradeInfo.CostMultiplier) / Math.log(tradeInfo.CostExponent);
  
  // In the ideal world, tradeCount has the exact answer, but we must deal with floating point precision
  let EPSILON = .0001;
  let roundedCount = Math.round(tradeCount);
  if (roundedCount >= 0 && Math.abs(tradeCount - roundedCount) < EPSILON) {
    return roundedCount;
  } else {
    return NaN;
  }
}

function clickComradeLimited(generatorId) {
  let checked = $('#configComradeLimited').is(':checked');
  $("#generators input[type='text'],input[type='number']").not(`#comrades,#comradesPerSec,#${generatorId}-count`).prop("disabled", checked);
}

function clickOffline() {
  let checked = $('#configOffline').is(':checked');
  $("#configAutobuy,#configComradeLimited,#configMaxDays").prop("disabled", checked);
  if (checked) {
    $("#configMaxDaysLabel").addClass("disabled");
  } else {
    $("#configMaxDaysLabel").removeClass("disabled");
  }
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
  if (simData.Config.Offline) {
    result = calcOffline(simData);
  } else if (simData.Config.ComradeLimited) {
    result = calcLimitedComrades(simData);
  } else {
    result = simulateProductionMission(simData);
  }
  
  $('#calcButton').removeAttr('disabled');
  $('#calcButton').removeClass('disabled');
  
  updateImportButton();
  
  if (result == -1) {
    if (simData.Config.Offline) {
      $('#result').text(`Offline calculation did not succeed. This may be due to invalid parameters.`);
    } else {
      $('#result').text(`Simulation did not complete in ${simData.Config.MaxDays} day(s). Try to increase the simulation time.`);
    }
  } else if (result < -1) {
    $('#result').text(`Simulation automatically terminated after 10 seconds (${getEta(-result)} had been simulated.)`);
  } else {
    $('#result').text(`ETA: ${getEta(result)}`);
  
    // Since we got a successful ETA, save it for future use.
    let missionEtas = getMissionEtas();
    let currentTimeStamp = (new Date()).getTime();
    missionEtas[simData.Mission.Id] = (new Date(currentTimeStamp + result * 1000)).getTime();
    
    saveMissionEtas(missionEtas);
    
    updateMissionButtonTitles(simData.Mission.Id);
    $('#lastEta').text(getMissionEtaString(missionEtas[simData.Mission.Id]));
  }
  
  $('#result').effect('highlight', {}, 2000);
}

// Returns a string 
function getEta(timeSeconds) {
  /* From https://stackoverflow.com/questions/1322732/convert-seconds-to-hh-mm-ss-with-javascript */
  let days = Math.floor(timeSeconds / (60 * 60 * 24));
  let [hours, minutes, seconds] = new Date(timeSeconds * 1000).toISOString().substr(11, 8).split(':');
  
  let eta = '';
  if (days > 0) {
    eta =  `${days}d ${hours}h ${minutes}m ${seconds}s`;
  } else if (hours > 0) {
    eta = `${hours}h ${minutes}m ${seconds}s`;
  } else if (minutes > 0) {
    eta = `${minutes}m ${seconds}s`;
  } else if (seconds > 0) {
    eta = `${seconds}s`;
  } else if (timeSeconds > 0.5) {
    eta = '1s';
  } else if (timeSeconds > 1e-3) {
    eta = `${Math.floor(timeSeconds*1e3)} ms`;
  } else if (timeSeconds > 1e-6) {
    eta = `${Math.floor(timeSeconds*1e6)} ${String.fromCharCode(181)}s`;
  } else if (timeSeconds > 1e-9) {
    eta = `${Math.floor(timeSeconds*1e9)} ns`;
  } else {
    eta = 'Instant';
  }
  
  // Strip any leading 0's off
  return eta.replace(/^0*/, '');
}

// Called OnClick for "Import Counts".  Takes past formData counts, simulates them forward to now, and then sets the inputs
function importCounts() {
  let DELTA_TIME = 1.0;
  
  let industryId = $('#industryId').val();
  let resourceId = getResourceByIndustry(industryId).Id;
  
  let formValues = getFormValuesObject();
  
  let simData = { Generators: [], Counts: {} };
  setupSimDataGenerators(simData, industryId, formValues, true);
  
  simData.Counts[resourceId] = formValues.Counts[resourceId][resourceId] || 0;
  simData.Counts["resourceProgress"] = formValues.Counts[resourceId]["resourceProgress"] || 0;
  
  // Calculate comrades' new value directly.
  let secondsSinceLastComradeInput = ((new Date()).getTime() - formValues.Counts.comrade.TimeStamp) / 1000;
  let comradesPerSec = formValues.Trades.TotalComrades;
  simData.Counts.comrade = formValues.Counts.comrade.comrade + comradesPerSec * secondsSinceLastComradeInput;
  
  // Run the simulation.
  let seconds = ((new Date()).getTime() - formValues.Counts[resourceId].TimeStamp) / 1000;
  for (let time = 0; time < seconds; time += DELTA_TIME) {
    // Run each generator, starting from the lowest-tier first.
    for (let genIndex in simData.Generators) {
      let generator = simData.Generators[genIndex];
      simData.Counts[generator.Resource] += simData.Counts[generator.Id] * generator.QtyPerSec * DELTA_TIME;
      
      // index 0 makes resources, so its also counts towards "resourceProgress"
      if (genIndex == 0) {
        simData.Counts["resourceProgress"] += simData.Counts[generator.Id] * generator.QtyPerSec * DELTA_TIME;
      }
    }
  };
  
  // Now fill in the form, setting 0 values as empty.
  for (let generator of simData.Generators) {
    setValueToCountOrEmpty(`#${generator.Id}-count`, simData.Counts[generator.Id]);
  }
  setValueToCountOrEmpty('#resources', simData.Counts[resourceId]);
  setValueToCountOrEmpty('#resourceProgress', simData.Counts["resourceProgress"]);
  setValueToCountOrEmpty('#comrades', simData.Counts["comrade"]);
  
  // Switch to the generators tab
  $('#generators-tab').tab('show');
}

function setValueToCountOrEmpty(elementId, count) {
  $(elementId).val((count > 0) ? bigNum(Math.round(count)) : "");
}

function getProductionSimDataFromForm() {
  let industryId = $('#industryId').val();
  let resourceId = getResourceByIndustry(industryId).Id;
  
  let missionId = $('#missionId').val();
  let mission = getMissions().find(m => m.Id == missionId);
  
  let formValues = getFormValuesObject();
  if (!formValues.Counts[resourceId]) {
    formValues.Counts[resourceId] = {};
  }
  if (!formValues.Counts["comrade"]) {
    formValues.Counts["comrade"] = {};
  }
  
  let simData = { Generators: [], Counts: {}, Mission: mission, IndustryId: industryId, Errors: 0, Config: {} };
  
  getValueFromForm('#resources', 0, simData, formValues, resourceId, resourceId);

  if (mission.Condition.ConditionType == "ResourcesEarnedSinceSubscription") {
    getValueFromForm('#resourceProgress', 0, simData, formValues, resourceId, 'resourceProgress');
  }
  
  let comradesPerSec = getValueFromForm('#comradesPerSec', 0, simData);
  getValueFromForm('#comrades', 0, simData, formValues, 'comrade', 'comrade');
  simData.Generators.push({Id: "comradegenerator", Resource: "comrade", QtyPerSec: comradesPerSec, Cost: []});
  simData.Counts["comradegenerator"] = 1;
  
  setupSimDataGenerators(simData, industryId, formValues);
  
  // Having 0 qty of every Generator is degenerate.  Let's at least start with 1 of the first.
  if (hasNoGenerators(simData)) {
    simData.Counts[simData.Generators[1].Id] = 1; // Generator[0] is the comradegenerator
  }
  
  simData.Config.Autobuy = $('#configAutobuy').is(':checked');
  simData.Config.ComradeLimited = $('#configComradeLimited').is(':checked');
  simData.Config.Offline = $('#configOffline').is(':checked');
  
  simData.Config.MaxDays = getValueFromForm('#configMaxDays', 1, simData);
  formValues.Config.MaxDays = simData.Config.MaxDays;
  
  formValues.Counts["comrade"].TimeStamp = (new Date()).getTime();
  formValues.Counts[resourceId].TimeStamp = formValues.Counts["comrade"].TimeStamp;
  
  // Overwrite the calculated value with whatever is on the form.
  // Useful is the user wants to override the Trades tab with their own saved manual CPS.
  formValues.Trades.TotalComrades = comradesPerSec;
  
  saveFormValues(formValues);
  
  // Finally, add in any final errors from trades
  simData.Errors += Object.values(formValues.Trades.Resource).reduce((sum, trade) => sum += (trade.IsInvalid) ? 1 : 0, 0);
  
  return simData;
}

// Fills in the simData.Generators array based on saved form values, and fills in simData.Counts for generators
function setupSimDataGenerators(simData, industryId, formValues, readSavedCounts = false) {
  let generators = getData().Generators.filter(g => g.IndustryId == industryId);
  let researchers = getResearchersByIndustry(industryId);
  let resourceId = getResourceByIndustry(industryId).Id;
  
  for (let generator of generators) {
    let genValues = getDerivedResearcherValues(generator, researchers, formValues);
    
    let costs = generator.Cost.map(c => ({ Resource: c.Resource.toLowerCase(), Qty: Number(c.Qty) }));
    for (let cost of costs) {
      if (cost.Resource != "comrade") {
        cost.Qty /= genValues.CostReduction;
      }
    }
    
    let unlockQty = generator.Unlock ? generator.Unlock.Threshold : 0;
    
    simData.Generators.push(({
      Id: generator.Id,
      Resource: generator.Generate.Resource,
      QtyPerSec: generator.Generate.Qty / generator.BaseCompletionTime * genValues.Power * genValues.Speed * (genValues.CritChance * genValues.CritPower + 1 - genValues.CritChance),
      Cost: costs,
      UnlockQty: unlockQty
    }));
    
    if (!readSavedCounts) {
      getValueFromForm(`#${generator.Id}-count`, 0, simData, formValues, resourceId, generator.Id);
    } else {
      simData.Counts[generator.Id] = formValues.Counts[resourceId][generator.Id] || 0;
    }
  }
}

// Returns whether all non-comrade generators have 0 count.
function hasNoGenerators(simData) {
  if (simData.Generators[0].Id != "comradegenerator") {
    console.error(`simData.Generators[0] is not "comradegenerator"`);
  }
  
  for (let i = 1; i < simData.Generators.length; i++) {
    if (simData.Counts[simData.Generators[i].Id] != 0) {
      return false;
    }
  }
  
  return true;
}

// For a given generator and subset of researchers, returns the derived Speed, Power, CritChance, CritPower and CostReduction
function getDerivedResearcherValues(generator, researchers, formValues) {
  let derivedValues = {
    Speed: 1,
    Power: 1,
    CritPower: generator.Crit.Multiplier,
    CritChance: generator.Crit.ChancePercent / 100,
    CostReduction: 1
  };
  
  // There should be only one Speed researcher, but for future proofing let's iterate through them all, though I'm not 100% sure how they would stack.
  let speedResearchers = researchers.filter(r => r.ModType == "GenManagerAndSpeedMult" && r.TargetIds[0].split(/, ?/).includes(generator.Id));
  for (let speedResearcher of speedResearchers) {
    derivedValues.Speed *= getValueForResearcherWithForm(speedResearcher, formValues); 
  }
  
  // Power researchers either target the generator itself, or one/all industries (case-insensitively).
  let powerResearchers = researchers.filter(r => r.ModType == "GeneratorPayoutMultiplier" && 
                                             (r.TargetIds[0].split(/, ?/).includes(generator.Id) ||
                                              r.TargetIds[0].toLowerCase().split(/, ?/).includes(generator.IndustryId.toLowerCase())));
  for (let powerResearcher of powerResearchers) {
    derivedValues.Power *= getValueForResearcherWithForm(powerResearcher, formValues); 
  }
  
  if (formValues.ResearcherLevels.PropagandaBoost) {
    derivedValues.Power *= 2;
  }
  
  // CritPower researchers target one/all industries (case-insensitively)
  let critPowerResearchers = researchers.filter(r => r.ModType == "GeneratorCritPowerMult" &&
                                                  r.TargetIds[0].toLowerCase().split(/, ?/).includes(generator.IndustryId.toLowerCase()));
  for (let critPowerResearcher of critPowerResearchers) {
    derivedValues.CritPower *= getValueForResearcherWithForm(critPowerResearcher, formValues); 
  }
  
  // CritChance researchers target one/all industries (case-insensitively)
  let critChanceResearchers = researchers.filter(r => r.ModType == "GeneratorCritChance" &&
                                                  r.TargetIds[0].toLowerCase().split(/, ?/).includes(generator.IndustryId.toLowerCase()));
  for (let critChanceResearcher of critChanceResearchers) {
    derivedValues.CritChance += getValueForResearcherWithForm(critChanceResearcher, formValues); 
  }
  
  // CostReduction researchers target one/all industries (case-insensitively)
  let discountResearchers = researchers.filter(r => r.ModType == "GeneratorCostReduction" &&
                                                  r.TargetIds[0].toLowerCase().split(/, ?/).includes(generator.IndustryId.toLowerCase()));
  for (let discountResearcher of discountResearchers) {
    derivedValues.CostReduction *= getValueForResearcherWithForm(discountResearcher, formValues); 
  }
  
  return derivedValues;
}

// Gets a value from the form (with error checking) and optionally stores that value in simData.Counts and formValues.Counts[resourceId]
function getValueFromForm(inputId, defaultValue, simData, formValues = null, resourceId = null, inputKey = null) {
  let value = fromBigNum($(inputId).val()) || Number($(inputId).val());
  let result = value || defaultValue;

  if (isNaN(value)) {
    $(inputId).addClass('is-invalid');
    simData.Errors += 1;
  } else {
    $(inputId).removeClass('is-invalid');
    
    if (formValues && resourceId && inputKey) {
      formValues.Counts[resourceId][inputKey] = value;
      simData.Counts[inputKey] = result;
    }
  }
  
  return result;
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

let NEW_FORM_VALUES_OBJECT = { 
  Config: {}, // e.g., 'AutoBuy': true
  ResearcherLevels: {}, // e.g., 'RS0011': 2
  ResearcherOverrides: {}, // e.g., 'RS0011': 0.5
  Counts: {}, // e.g., 'land': {'worker': 10, ..., 'land': 150, 'resourceProgress': 100, 'TimeStamp': 1579683943747}
  Trades: {
    TotalComrades: 1,
    Resource: {} // e.g., 'land': {NextCost: "", Count: 0, ComradesPerTrade: 0, TotalComrades: 0, IsInvalid: false}
  }
};

// Returns an object representing saved form information
function getFormValuesObject() {
  let valuesString = getLocal(currentMode, "FormValues");
  if (!valuesString) {
    return NEW_FORM_VALUES_OBJECT;
  }
  
  try {
    let result = JSON.parse(valuesString);
    
    if (!result.ResearcherLevels) {
      // This is an old-style FormValues or otherwise no longer valid.
      return NEW_FORM_VALUES_OBJECT;
    } else {
      return result;
    }
  } catch (err) {
    return NEW_FORM_VALUES_OBJECT;
  }
}

function saveFormValues(formValuesObject) {
  setLocal(currentMode, "FormValues", JSON.stringify(formValuesObject));
}

// Gets mission etas, which are save data from the last time you calculated each mission.
function getMissionEtas() {
  let etasString = getLocal(currentMode, getMissionEtasKey());
  if (!etasString) {
    return {};
  }
  
  try {
    return result = JSON.parse(etasString);
  } catch (err) {
    return {};
  }
}

function saveMissionEtas(missionEtas) {
  setLocal(currentMode, getMissionEtasKey(), JSON.stringify(missionEtas));
}

function getMissionEtasKey() {
  if (currentMode == "main") {
    return `MissionEtas-${currentMainRank}`; // saved by rank for some efficiency
  } else {
    return "MissionEtas";
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
  }
  
  let currentComrades = simData.Counts["comrade"] || 0;
  let neededComrades = gensNeeded * comradeCost.Qty - currentComrades;
  
  return Math.max(neededComrades / comradeGenerator.QtyPerSec, 0);
}

// We don't need to do a full simulation for offline, but we do need to estimate a polynomial root
function calcOffline(simData) {
  // There are two possibilities for offline: it's either comrade-limited (for Own) or production-limited.
  let comradeLimitedTime = 0;
  if (simData.Mission.Condition.ConditionType == "ResourceQuantity") {
    comradeLimitedTime = calcLimitedComrades(simData);
  }
  
  let prodLimitedTime = calcOfflineProduction(simData);

  if (Math.min(comradeLimitedTime, prodLimitedTime) < 0) {
    return -1; // one objective will mathematically never complete
  } else {
    return Math.max(comradeLimitedTime, prodLimitedTime);
  }
}

function calcOfflineProduction(simData) {
  // There appears to be a bug in the game's offline calculations, where the deepest generator
  //  is "run" for entire offline duration, followed by the second-deepest, etc., instead of
  //  continuously running it.  This can make long offline sessions more effective than online.
  
  // I think the formula for the process creates a polynomial like:
  // Potato(t) = Potato(0) + [Farmer(0) * FarmerOut]t + [Commune(0) * CommuneOut * FarmerOut]t^2
  //                       + [Freight(0) * FreightOut * CommuneOut * FarmerOut]t^3 + ...
  
  // We will find coefficients, and apply Newton's method to:  Potato(t) - GoalPotato = 0
  let resourceId = getResourceByIndustry(simData.IndustryId).Id;
  let resourceGoal = getOfflineResourceGoal(simData);
  
  // Create f(x) = Potato(t) - GoalPotato, aka poly[]
  let poly = [simData.Counts[resourceId] - resourceGoal];
  if (poly[0] >= 0) {
    return 0;  // The user claims to have enough resources to meet their goal.
  }
  
  // Skip the comrade generator (simData.Generators[0]), otherwise find each coefficient
  for (let genIndex = 1; genIndex < simData.Generators.length; genIndex++) {
    let generator = simData.Generators[genIndex];
    let coefficient = simData.Counts[generator.Id];
    
    for (let lowerGenIndex = 1; lowerGenIndex <= genIndex; lowerGenIndex++) {
      coefficient *= simData.Generators[lowerGenIndex].QtyPerSec;
    }
    
    poly.push(coefficient);
  }
  
  // Create f'(x), aka deriv[]
  let deriv = []
  for (polyIndex = 1; polyIndex < poly.length; polyIndex++) {
    deriv.push(poly[polyIndex] * polyIndex);
  }
  
  // Iterate x1 = x0 - f(x0) / f'(x0) until |x1 - x0| < 0.1
  let x = 10000;
  for (let chances = 1000; chances > 0; chances--) {
    let oldX = x;
    x = x - evaluatePolynomial(poly, x) / evaluatePolynomial(deriv, x);

    if (Math.abs(x - oldX) < 0.1) {
      if (Math.abs(x) === Infinity || isNaN(x) || x < 0) {
        return -1; // An error occurred or the mission will mathematically never complete (such as negative)
      } else {
        return x;
      }
    }
  }
  
  // We failed to find a close enough result in 1000 chances.
  return -1;
}

// Get an appropriate resource goal dependant on the mission type.
function getOfflineResourceGoal(simData) {
  let condition = simData.Mission.Condition;
  let resourceId = getResourceByIndustry(simData.IndustryId).Id;
  
  if (condition.ConditionType == "ResourcesEarnedSinceSubscription") {
    let resourceProgress = simData.Counts["resourceProgress"] || 0;
    let currentResource = simData.Counts[condition.ConditionId] || 0;
    return condition.Threshold - resourceProgress + currentResource;
    
  } else if (condition.ConditionType == "ResourceQuantity") {
    let generator = simData.Generators.find(g => g.Id == condition.ConditionId);
    let resCost = generator.Cost.find(c => c.Resource == resourceId);
    return resCost.Qty * (condition.Threshold - simData.Counts[generator.Id]);
    
  } else if (condition.ConditionType == "IndustryUnlocked") {
    let industry = getData().Industries.find(i => i.Id == condition.ConditionId);
    return industry.UnlockCostResourceQty - simData.Counts[industry.UnlockCostResourceId.toLowerCase()];
    
  } else {
    console.error(`Unknown condition type: ${condition.ConditionType}`);
  }
}

// Evaluates a polynomial at a value given the coefficients
function evaluatePolynomial(poly, value) {
  let result = 0;
  
  for (let power = 0; power < poly.length; power++) {
    result += poly[power] * Math.pow(value, power);
  }
  
  return result;
}

// The core "simulation."  Returns seconds until goal is met, or -1 if goal is not met in MaxDays.
function simulateProductionMission(simData, deltaTime = 1.0) {
  // First, handle autobuy, if enabled.
  let autobuyGenerator = null;
  let nextAutobuyGenerator = null;
  let genesisTime = new Date();
  
  // search backwards through the generators for the first one with Qty > 0
  if (simData.Config.Autobuy) {
    for (let genIndex = simData.Generators.length - 1; genIndex >= 0; genIndex--) {
      if (simData.Counts[simData.Generators[genIndex].Id] > 0) {
        autobuyGenerator = simData.Generators[genIndex];
        
        if (genIndex + 1 < simData.Generators.length && simData.Generators[genIndex + 1].QtyPerSec > 0) {
          nextAutobuyGenerator = simData.Generators[genIndex + 1];
        }
        
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
      goals = [{ Resource: industry.UnlockCostResourceId.toLowerCase(), Qty: industry.UnlockCostResourceQty }];
      break;
    case "ResourceQuantity":
      let simGenerator = simData.Generators.find(g => g.Id == condition.ConditionId);
      if (simData.Config.Autobuy || !simGenerator) {
        // If Autobuy is enabled, we can assume reaching the condition is plausible
        // If simGenerator is undefined, it's a stupid "Own Resource" mission.
        goals = [{ Resource: condition.ConditionId, Qty: condition.Threshold }];
      } else {
        // Instead of directly waiting until we get N generators, we figure out the cost difference
        // This is since we might not be able to reach the condition directly without autobuy.
        let gensNeeded = condition.Threshold - simData.Counts[condition.ConditionId];
        for (let cost of simGenerator.Cost) {
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
      }
      break;
    default:
      console.error(`Error: Weird situation! Simulating unknown ConditionType=${condition.ConditionType}`);
  }
  
  // Now do the iteration
  let maxTime = simData.Config.MaxDays * 24 * 60 * 60; // convert max days to max seconds
  let time;
  for (time = 0; time < maxTime && !metGoals(simData, goals); time += deltaTime) {
    // Cancel simulation after 10 seconds (we don't want to crash the page.)
    if (new Date() - genesisTime > 10000) {
      return -time;
    }

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
      // First buy as many of the autobuyGenerator as possible
      let buyCount = getBuyCount(simData, autobuyGenerator);
      for (let cost of autobuyGenerator.Cost) {
        simData.Counts[cost.Resource] -= cost.Qty * buyCount;
      }
      simData.Counts[autobuyGenerator.Id] += buyCount;
      
      // Then check to see if the purchases have unlocked a new tier of generator.
      if (nextAutobuyGenerator && simData.Counts[autobuyGenerator.Id] >= nextAutobuyGenerator.UnlockQty) {
        autobuyGenerator = nextAutobuyGenerator;
        simData.Counts[autobuyGenerator.Id] = 1;
        
        let autobuyGeneratorIndex = simData.Generators.indexOf(autobuyGenerator);
        nextAutobuyGenerator = simData.Generators[autobuyGeneratorIndex + 1]; // may be undefined if at the last tier
        
        // If the next generator won't produce anything, don't switch to it.
        if (nextAutobuyGenerator && nextAutobuyGenerator.QtyPerSec == 0) {
          nextAutobuyGenerator = null;
        }
      }
    }
    
  }
  
  if (time >= maxTime) {
    return -1;
  } else {
    return time - 1; // subtract 1 second from this value (insta-complete missions are now accurately marked as instant)
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

// Handles modifier keystrokes on input boxes
function inputKeyboardHandler(event, isNowActive) {
  if (event.target.tagName.toLowerCase() === 'input') {
    // select keystrokes on input fields
    if (event.originalEvent) {
      let keyboardEvent = event.originalEvent;
      /*
        Delta Order of Magnitude (DOOM)

        Specifies by what extremity a value should be changed (e.g. Control+Up Arrow should be much greater than Alt+Up Arrow.)
        If this value is left as 0, no change should occur.
        Modifier key rules follow DevTools order.
        -4  CTRL+Down
        -3  SHIFT+Down
        -2  ALT+Down
        -1  Down
         0  N/A, probably a different keyboard shortcut or no-op
         1  Up
         2  ALT+Up
         3  SHIFT+Up
         4  CTRL+Up
      */
      let deltaOrderOfMagnitude = 0;

      switch (keyboardEvent.key) {
        case "Down":
        case "ArrowDown":
          // SUBTRACT from an input value
          deltaOrderOfMagnitude--;
          break;
        case "Up":
        case "ArrowUp":
          // ADD to an input value
          deltaOrderOfMagnitude++;
          break;
        case "Enter":
          // Calculate/Import Counts
          if (event.target.matches('#calc *')) {
            // only do submission if it's an input box for a mission
            if (keyboardEvent.ctrlKey && !keyboardEvent.shiftKey) {
              // CTRL+ENTER: Import Counts
              importCounts();
            } else if (keyboardEvent.ctrlKey && keyboardEvent.shiftKey) {
              // CTRL+SHIFT+ENTER: Import Counts and Calculate
              importCounts();
              doProductionSim();
            } else {
              // ENTER: Calculate
              doProductionSim();
            }
          }
      }
      
      if (keyboardEvent.ctrlKey && keyboardEvent.shiftKey) {
        deltaOrderOfMagnitude *= 5;
      } else if (keyboardEvent.ctrlKey) {
        deltaOrderOfMagnitude *= 4;
      } else if (keyboardEvent.shiftKey) {
        deltaOrderOfMagnitude *= 3;
      } else if (keyboardEvent.altKey) {
        deltaOrderOfMagnitude *= 1;
      } else {
        deltaOrderOfMagnitude *= 2;
      }

      if (deltaOrderOfMagnitude !== 0) {
        keystrokeInputLogic(event.target, deltaOrderOfMagnitude);
      }
    }
  }
  
  // At this point, keyboard shortcuts do not require focus on an input box
  if (event.originalEvent && event.originalEvent.altKey) {
    let keyboardEvent = event.originalEvent;
    for (i of $(".tab-pane")) {
      if (i.offsetParent !== null) {
        switch (keyboardEvent.key) {
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9":
          case "0":
          case "-":
          case "=":
            // search for active input panes
            let key = keyboardEvent.key;
            let intId;
            if (key === '-') {
              intId = 10;
            } else if (key === '=') {
              intId = 11;
            } else {
              if (parseInt(key) <= 0) {
                // roll over key 0 to index 9 (assuming numrow)
                intId = 9;
              } else {
                intId = parseInt(key) - 1;
              }
            }

            try {
              let element = $(`#${i.id} .form-control`)[intId];
              if (element.matches('[id$="count"]') || element.matches('[id$="trade-cost"]')) {
                // only concerned about generators/trade costs at this point
                element.focus();
              }
            } catch (e) {
              // out of bounds
            }

            break;
          case 'r':
            // resource quantity
            try {
              $(`#${i.id} #resources`).focus();
            } catch (e) {
              // out of bounds
            }

            break;
          case 'p':
            // resource progress
            try {
              $(`#${i.id} #resourceProgress`).focus();
            } catch (e) {
              // out of bounds
            }

            break;
          case 'c':
            // total comrades
            try {
              $(`#${i.id} #comrades`).focus();
            } catch (e) {
              // out of bounds
            }

            break;
          case 's':
            // cps
            try {
              $(`#${i.id} #comradesPerSec`).focus();
            } catch (e) {
              // out of bounds
            }

            break;
        }
      }
    }
  }
}

// Performs task-specific logic for keystrokes
function keystrokeInputLogic(dom, doom) {
  /*
    Unique Input Box Phenotypes
    See "Keyboard Shortcuts" in page for documentation

    Type                  DOM Selector
    Generator count       [id$="count"]
    Resource count        #resources, #resourceProgress
    Comrade trades        [id$="trade-cost"]
    Comrade count         #comrades
    Comrades per second   #comradesPerSec
  */

  // determine raw input value
  let rawValue = fromBigNum(dom.value) || Number(dom.value);

  if (dom.matches('[id$="count"]') || dom.matches('#resources') || dom.matches('#resourceProgress')) {
    // Generator/resource count
    if (rawValue === 0 && doom > 0) {
      // set to 1 and return
      dom.value = 1;
      return;
    } 
    let thousandPower = Math.floor(Math.log(rawValue) / Math.log(1000));
    let modPower = (thousandPower * 3) + Math.abs(doom) - 2;
    let newValue;
    let newThousandPower;

    if (Math.abs(doom) < 5) {
      // change position based on delta order of magnitude
      newValue = rawValue + Math.pow(10, modPower) * (doom / Math.abs(doom));
      newThousandPower = Math.floor(Math.log(newValue) / Math.log(1000));
    } else {
      let powerDelta;
      switch (Math.abs(doom)) {
        case 5:
          powerDelta = 3;
          break;
        case 6:
          powerDelta = 30;
          break;
        case 7:
          powerDelta = 78;
          break;
        default:
          return;
      }
      // increase/decrease by letters
      newValue = rawValue * Math.pow(10, powerDelta  * (Math.abs(doom)/doom));
      newThousandPower = thousandPower;
    }
    dom.value = ((bigNum(newValue) === 'NaN undefined' || newValue < 1 || newThousandPower !== thousandPower) ? dom.value : bigNum(newValue));
  } else if (dom.matches('[id$="trade-cost"]')) {
    // Comrade trades
    tradeLevelDelta(dom.id.substr(0, dom.id.indexOf('-')), (Math.abs(doom) > 1 ? Math.pow(5, Math.abs(doom)-2) * (Math.abs(doom)/doom): 0));
  } else if (dom.matches('#comrades') || dom.matches('#comradesPerSec')) {
    // Comrade count/comrades per second
    if (rawValue === 0 && doom > 0) {
      // set to 1 and return
      dom.value = 1;
      return;
    } else if (doom <= 5 && doom >= -5) {
      let coefficient = (dom.matches('#comrades') ? 3 : 2);
      let newValue = rawValue + Math.pow(10, (coefficient * (Math.abs(doom) - 1))) * (Math.abs(doom)/doom);
      dom.value = (bigNum(newValue) === 'NaN undefined' || newValue < 0) ? 0 : bigNum(newValue);
    }
  } else {
    console.warn(`Invalid input selector ${dom}; please report this!`);
  }
}

main();
