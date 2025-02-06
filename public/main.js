import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, collection, addDoc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAspuXUOSXqDwRHrkow-wyE2HD0UGg79q0",
    authDomain: "whatsapp-sender-5f564.firebaseapp.com",
    projectId: "whatsapp-sender-5f564",
    storageBucket: "whatsapp-sender-5f564.firebasestorage.app",
    messagingSenderId: "648718768183",
    appId: "1:648718768183:web:d6a648b579ca8dab8c07b2",
    measurementId: "G-G4J5VN9GVF",
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

let userEmail = "";

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById("messageSenderSection").style.display = "block";
        userEmail = user.email;
        const userName = user.displayName || "No name available";
        const userPhotoURL = user.photoURL;
        const providerId = user.providerData[0].providerId;

        document.getElementById("modalUserEmail").textContent = userEmail;
        document.getElementById("modalUserName").textContent = userName;
        document.getElementById("modalProviderId").textContent = providerId;

        const userPhotoElement = document.getElementById("userEmail");
        if (userPhotoURL) {
            userPhotoElement.innerHTML = `<img src="${userPhotoURL}" alt="User Profile" style="width: 50px; height: 50px; border-radius: 50%;"/>`;
        } else {
            const initials = userName.split(" ").map((n) => n[0]).join("").toUpperCase();
            userPhotoElement.textContent = initials;
        }

        document.getElementById("logoutButton").addEventListener("click", () => {
            closeAllDiv();
            document.getElementById("signedOut").style.display = "block";
            document.getElementById("menu_btn").disabled = true;
            document.getElementById("modalUserEmail").textContent = "";
            document.getElementById("modalUserName").textContent = "";
            document.getElementById("modalProviderId").textContent = "";
            document.getElementById("userEmail").textContent = "";
            signOut(auth)
                .then(() => console.log("User signed out."))
                .catch((error) => {
                    console.error("Error during logout:", error);
                    alert("Failed to log out. Please try again.");
                });
        });
    } else {
        closeAllDiv();
        document.getElementById("signedOut").style.display = "block";
        document.getElementById("menu_btn").disabled = true;
    }
});

function closeAllDiv() {
    document.getElementById("messageSenderSection").style.display = "none";
}

function signIn() {
    document.getElementById("loadingOverlay").style.display = "block";
    signInWithPopup(auth, provider)
        .then(async (result) => {
            const user = result.user;
            const allowedEmails = ["sibhi@aurobindovidhyalaya.edu.in", "anupriyab@aurobindovidhyalaya.edu.in", "sudhad@aurobindovidhyalaya.edu.in"]; // Add allowed emails here

            if (allowedEmails.includes(user.email)) {
                document.getElementById("signedOut").style.display = "none";
                document.getElementById("messageSenderSection").style.display = "block";
                document.getElementById("menu_btn").disabled = false;
                document.getElementById("commentsByStudents").style.display = "block";
            } else {
                closeAllDiv()
                // document.getElementById("commentsByStudents").style.display = "none";
                document.getElementById("modalUserEmail").textContent = "";
                document.getElementById("modalUserName").textContent = "";
                document.getElementById("modalProviderId").textContent = "";
                document.getElementById("userEmail").textContent = "";
                await signOut(auth);
                alert("Access denied. Only users with allowed email addresses can sign in.");
            }
        })
        .catch((error) => {
            console.error("Error during sign-in:", error);
            switch (error.code) {
                case "auth/popup-closed-by-user":
                    alert("The sign-in popup was closed before completing the sign-in process. Please try again.");
                    break;
                case "auth/popup-blocked":
                    alert("The sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
                    break;
                case "auth/network-request-failed":
                    alert("Network error occurred during sign-in. Please check your internet connection and try again.");
                    break;
                case "auth/cancelled-popup-request":
                    alert("A conflicting sign-in popup request was made. Please wait and try again.");
                    break;
                default:
                    alert("An unexpected error occurred. Please try again later.");
            }
        })
        .finally(() => document.getElementById("loadingOverlay").style.display = "none");
}

async function logHistoryToFirestore(headingData, entryData) {
    const { messageTemplate, dueDate } = headingData;
    const timestamp = new Date().toLocaleString();
    const timestampDate = new Date().toLocaleDateString().replaceAll("/", "-");

    try {
        const logDocRef = doc(db, "messageLogs", `${messageTemplate}_${timestampDate}`);
        await setDoc(logDocRef, { userEmail, messageTemplate, dueDate, timestamp }, { merge: true });
        const entriesCollectionRef = collection(logDocRef, "entries");
        await addDoc(entriesCollectionRef, entryData);
        console.log("Log entry added successfully.");
    } catch (error) {
        console.error("Error logging data to Firestore:", error);
    }
}

async function populateMessageTemplates() {
    const templateDropdown = document.getElementById("messageTemplate");
    try {
        const response = await fetch("https://us-central1-whatsapp-sender-5f564.cloudfunctions.net/fetchGoogleSheetData", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ range: "Variables!A2:A" }),
        });

        if (!response.ok) {
            console.error(`Failed to fetch templates. HTTP status: ${response.status}`);
            throw new Error(`Failed to fetch templates. HTTP status: ${response.status}`);
        }

        const templates = await response.json();
        if (templates.length === 0) {
            throw new Error("No templates found in the sheet.");
        }

        templateDropdown.innerHTML = '<option value="" disabled selected>Select a template</option>';
        templates.forEach((template) => {
            const option = document.createElement("option");
            option.value = template;
            option.textContent = template;
            templateDropdown.appendChild(option);
        });
    } catch (error) {
        console.error("Error fetching templates:", error);
        templateDropdown.innerHTML = '<option value="" disabled selected>Error loading templates</option>';
    }
}

async function startProcess() {
    const statusElement = document.getElementById("status");
    const progressElement = document.getElementById("progress");
    const logElement = document.getElementById("messageLog");
    const startProcessBtn = document.getElementById("startProcessBtn");

    logElement.innerHTML = "";
    const messageTemplate = document.getElementById("messageTemplate").value.trim();
    const dueDate = document.getElementById("dueDate").value;
    const term = document.getElementById("term").value.trim();
    const useSenderSheet = document.getElementById("useSenderSheet").checked;
    const sheetName = useSenderSheet ? "Send" : "Test";

    if (!messageTemplate || !dueDate) {
        statusElement.innerText = "Please enter both the message template and the due date.";
        return;
    }

    statusElement.innerText = "Fetching data...";
    progressElement.value = 0;
    startProcessBtn.disabled = true; // Disable the button

    try {
        const sheetResponse = await fetch("https://us-central1-whatsapp-sender-5f564.cloudfunctions.net/fetchGoogleSheetData", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ range: `${sheetName}!A2:Z1000` }),
        });

        if (!sheetResponse.ok) {
            throw new Error("Failed to fetch sheet data. HTTP status: " + sheetResponse.status);
        }

        const sheetData = await sheetResponse.json();
        if (!Array.isArray(sheetData) || sheetData.length === 0) {
            throw new Error("No data found in the sheet.");
        }

        statusElement.innerText = "Data fetched. Sending messages...";
        const totalRows = sheetData.length;

        for (const [index, row] of sheetData.entries()) {
            const studentName = row[1];
            const phoneNumber1 = row[2];
            const phoneNumber2 = row[3];
            const phoneNumber3 = row[4];
            const dueFees = row[7];

            if (!studentName || !dueFees) {
                console.error(`Skipping row ${index + 1}: Missing fields`);
                continue;
            }

            const phoneNumbers = [phoneNumber1, phoneNumber2, phoneNumber3].filter(Boolean).map((number) => number.replace(/-/g, ""));
            const uniquePhoneNumbers = [...new Set(phoneNumbers)];

            for (const phoneNumber of uniquePhoneNumbers) {
                try {
                    const requestData = { phoneNumber, studentName, dueFees, messageTemplate, dueDate };

                    if (messageTemplate !== "hostel_fees_due_tamil" && messageTemplate !== "total_due_fess_tamil" && messageTemplate !== "board_exam_due_fees_tamil") {
                        requestData.term = term;
                    }

                    const response = await fetch("https://us-central1-whatsapp-sender-5f564.cloudfunctions.net/sendWhatsappMessageHttp", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(requestData),
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to send message to ${phoneNumber}.`);
                    }

                    const result = await response.json();
                    const logItem = document.createElement("li");
                    logItem.textContent = `Message sent to ${phoneNumber} (Student: ${studentName}, Fees: ${dueFees}).`;
                    logElement.appendChild(logItem);

                    const wamId = result.response.messages[0].id;

                    await logHistoryToFirestore({ messageTemplate, dueDate }, {
                        timestamp: new Date().toISOString(),
                        phoneNumber,
                        studentName,
                        status: "success",
                        result,
                        dueFees,
                        wamId,
                    });
                } catch (error) {
                    const logItem = document.createElement("li");
                    logItem.textContent = `Failed to send message to ${phoneNumber}. Error: ${error.message}`;
                    logItem.style.color = "red";
                    logElement.appendChild(logItem);
                }
            }

            const progress = Math.round(((index + 1) / totalRows) * 100);
            progressElement.value = progress;
        }

        statusElement.innerText = "All messages sent successfully!";
    } catch (error) {
        console.error("Error in process:", error);
        statusElement.innerText = "Error: " + error.message;
    } finally {
        startProcessBtn.disabled = false; // Re-enable the button
    }
}

function stopProcess() {
    const stopMessageProcess = httpsCallable(functions, "stopMessageProcess");
    stopMessageProcess()
        .then(() => {
            document.getElementById("status").innerText = "Process stopped.";
            document.getElementById("progress").value = 0;
        })
        .catch((error) => {
            document.getElementById("status").innerText = "Error: " + error.message;
        });
}

async function loadMessageHistory() {
    document.getElementById("loadingOverlay").style.display = "block";
    const historyList = document.getElementById("historyList");
    historyList.innerHTML = "";

    try {
        const logsRef = collection(db, "messageLogs");
        const logsSnapshot = await getDocs(logsRef);

        if (logsSnapshot.empty) {
            historyList.innerHTML = "<li>No message history found.</li>";
            return;
        }

        logsSnapshot.forEach((doc) => {
            const data = doc.data();
            const historyBox = document.createElement("div");
            historyBox.className = "comment-box";
            historyBox.innerHTML = `
                <p class="template-name">Template: <span>${data.messageTemplate}</span></p>
                <p class="due-date">Due Date: <span>${data.dueDate}</span></p>
                <p class="timestamp">Timestamp: <span>${new Date(data.timestamp).toLocaleString()}</span></p>
            `;
            historyBox.addEventListener("click", () => viewLogDetails(doc.id));
            historyList.appendChild(historyBox);
        });
    } catch (error) {
        console.error("Error loading history:", error);
        historyList.innerHTML = "<li>Error loading history.</li>";
    }
    document.getElementById("loadingOverlay").style.display = "none";
}

async function viewLogDetails(logId) {
    document.getElementById("loadingOverlay").style.display = "block";
    try {
        const logRef = doc(db, "messageLogs", logId);
        const logSnapshot = await getDoc(logRef);

        if (!logSnapshot.exists()) {
            alert("Log not found.");
            return;
        }

        const logData = logSnapshot.data();
        const entriesRef = collection(logRef, "entries");
        const entriesSnapshot = await getDocs(entriesRef);

        let uniqueStudents = new Set();
        let totalNumbers = 0;
        let totalDueFees = 0;
        let totalSent = 0;
        let totalDelivered = 0;
        let totalRead = 0;

        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'details-container';

        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'summary-container';

        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.innerHTML = `
            <input type="text" id="searchLogDetails" class="input-field" placeholder="Search log details..." />
        `;

        const detailsTable = document.createElement('table');
        detailsTable.className = 'details-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Student Name', 'Phone Number', 'Status', 'Due Fees', 'Timestamp', 'Status Bar'];
        headers.forEach((headerText, index) => {
            const th = document.createElement('th');
            th.innerHTML = `${headerText} <span class="sort-indicator">&#9650;</span>`;
            th.addEventListener('click', () => {
                sortTable(detailsTable, index);
                toggleSortIndicator(th);
            });
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        detailsTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const entryDoc of entriesSnapshot.docs) {
            const entry = entryDoc.data();
            uniqueStudents.add(entry.studentName);
            totalDueFees += parseFloat(entry.dueFees);

            const row = document.createElement('tr');
            const studentNameCell = document.createElement('td');
            studentNameCell.textContent = entry.studentName;
            row.appendChild(studentNameCell);

            const phoneNumberCell = document.createElement('td');
            phoneNumberCell.textContent = entry.phoneNumber;
            row.appendChild(phoneNumberCell);

            const statusCell = document.createElement('td');
            statusCell.textContent = entry.status;
            row.appendChild(statusCell);

            const dueFeesCell = document.createElement('td');
            dueFeesCell.textContent = entry.dueFees;
            row.appendChild(dueFeesCell);

            const timestampCell = document.createElement('td');
            timestampCell.textContent = new Date(entry.timestamp).toLocaleString();
            row.appendChild(timestampCell);

            const logsRef = collection(entryDoc.ref, "logs");
            const logsSnapshot = await getDocs(logsRef);

            let read = false;
            let delivered = false;
            let sent = false;

            logsSnapshot.forEach(logDoc => {
                const log = logDoc.data();
                const status = log.entry[0].changes[0].value.statuses[0].status;
                if (status === "read") {
                    read = true;
                    totalRead += 1;
                } else if (status === "delivered") {
                    delivered = true;
                    totalDelivered += 1;
                } else if (status === "sent") {
                    sent = true;
                    totalSent += 1;
                }
            });

            const statusBarCell = document.createElement('td');
            const statusBar = document.createElement('div');
            statusBar.className = 'status-bar';

            const sentIndicator = document.createElement('div');
            sentIndicator.className = 'status-indicator';
            sentIndicator.style.backgroundColor = sent ? 'green' : 'gray';
            statusBar.appendChild(sentIndicator);

            const deliveredIndicator = document.createElement('div');
            deliveredIndicator.className = 'status-indicator';
            deliveredIndicator.style.backgroundColor = delivered ? 'green' : 'gray';
            statusBar.appendChild(deliveredIndicator);

            const readIndicator = document.createElement('div');
            readIndicator.className = 'status-indicator';
            readIndicator.style.backgroundColor = read ? 'green' : 'gray';
            statusBar.appendChild(readIndicator);

            statusBarCell.appendChild(statusBar);
            row.appendChild(statusBarCell);

            tbody.appendChild(row);
        }
        detailsTable.appendChild(tbody);

        totalNumbers = entriesSnapshot.size;

        const sentPercentage = ((totalSent / totalNumbers) * 100).toFixed(2);
        const deliveredPercentage = ((totalDelivered / totalNumbers) * 100).toFixed(2);
        const readPercentage = ((totalRead / totalNumbers) * 100).toFixed(2);

        summaryContainer.innerHTML = `
            <div class="summary-item">
                <p><strong>Total Students:</strong> ${uniqueStudents.size}</p>
            </div>
            <div class="summary-item">
                <p><strong>Total Numbers:</strong> ${totalNumbers}</p>
            </div>
            <div class="summary-item">
                <p><strong>Total Due Fees:</strong> ${totalDueFees}</p>
            </div>
            <div class="summary-item">
                <p><strong>Sent:</strong> ${sentPercentage}%</p>
                <progress value="${sentPercentage}" max="100" class="progress-bar"></progress>
            </div>
            <div class="summary-item">
                <p><strong>Delivered:</strong> ${deliveredPercentage}%</p>
                <progress value="${deliveredPercentage}" max="100" class="progress-bar"></progress>
            </div>
            <div class="summary-item">
                <p><strong>Read:</strong> ${readPercentage}%</p>
                <progress value="${readPercentage}" max="100" class="progress-bar"></progress>
            </div>
        `;

        detailsContainer.appendChild(summaryContainer);
        detailsContainer.appendChild(searchContainer);
        detailsContainer.appendChild(detailsTable);

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';

        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';

        const modalHeader = document.createElement('div');
        modalHeader.className = 'modal-header';
        modalHeader.innerHTML = `
            <h2>Log Details</h2>
            <span class="close-modal" style="cursor: pointer; font-size: 20px">&times;</span>
        `;
        modalContent.appendChild(modalHeader);

        const modalBody = document.createElement('div');
        modalBody.className = 'modal-body';
        modalBody.appendChild(detailsContainer);
        modalContent.appendChild(modalBody);

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        document.querySelector('.close-modal').addEventListener('click', () => {
            modal.style.display = 'none';
            document.body.removeChild(modal);
        });

        document.getElementById('searchLogDetails').addEventListener('input', () => filterLogDetails(detailsTable));

    } catch (error) {
        console.error("Error viewing log details:", error);
        alert("Error viewing log details.");
    }
    document.getElementById("loadingOverlay").style.display = "none";
}

function filterLogDetails(table) {
    const searchInput = document.getElementById("searchLogDetails").value.toLowerCase();
    const rows = table.getElementsByTagName("tr");

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName("td");
        let match = false;
        for (let j = 0; j < cells.length; j++) {
            if (cells[j].textContent.toLowerCase().includes(searchInput)) {
                match = true;
                break;
            }
        }
        rows[i].style.display = match ? "" : "none";
    }
}

function sortTable(table, columnIndex) {
    const rows = Array.from(table.getElementsByTagName("tr")).slice(1);
    const sortedRows = rows.sort((a, b) => {
        const aText = a.getElementsByTagName("td")[columnIndex].textContent;
        const bText = b.getElementsByTagName("td")[columnIndex].textContent;
        return aText.localeCompare(bText);
    });

    const tbody = table.getElementsByTagName("tbody")[0];
    tbody.innerHTML = "";
    sortedRows.forEach(row => tbody.appendChild(row));
}

function toggleSortIndicator(header) {
    const indicator = header.querySelector('.sort-indicator');
    if (indicator.textContent === '▲') {
        indicator.textContent = '▼';
    } else {
        indicator.textContent = '▲';
    }
}

function createPieChart(canvasId, label, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: data.map(d => d.label),
            datasets: [{
                data: data.map(d => d.value),
                backgroundColor: [
                    'rgba(75, 192, 192, 0.2)',
                    'rgba(54, 162, 235, 0.2)',
                    'rgba(255, 99, 132, 0.2)'
                ],
                borderColor: [
                    'rgba(75, 192, 192, 1)',
                    'rgba(54, 162, 235, 1)',
                    'rgba(255, 99, 132, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: label
                }
            }
        }
    });
}

function toggleMenu() {
    const sidebar = document.getElementById("sidebar");
    sidebar.style.width = sidebar.style.width === "250px" ? "0" : "250px";
}

function toggleView(view) {
    const messageSenderSection = document.getElementById("messageSenderSection");
    const messageHistorySection = document.getElementById("messageHistorySection");
    const statisticsSection = document.getElementById("statisticsSection");
    const incomingMessagesSection = document.getElementById("incomingMessagesSection");

    if (view === "sender") {
        messageSenderSection.style.display = "block";
        messageHistorySection.style.display = "none";
        statisticsSection.style.display = "none";
        incomingMessagesSection.style.display = "none";
    } else if (view === "history") {
        messageSenderSection.style.display = "none";
        messageHistorySection.style.display = "block";
        statisticsSection.style.display = "none";
        incomingMessagesSection.style.display = "none";
        loadMessageHistory();
    } else if (view === "statistics") {
        messageSenderSection.style.display = "none";
        messageHistorySection.style.display = "none";
        statisticsSection.style.display = "block";
        incomingMessagesSection.style.display = "none";
        loadStatistics();
    } else if (view === "incomingMessages") {
        messageSenderSection.style.display = "none";
        messageHistorySection.style.display = "none";
        statisticsSection.style.display = "none";
        incomingMessagesSection.style.display = "block";
    }
    toggleMenu()
    localStorage.setItem("lastView", view);
}

function filterHistory() {
    const searchInput = document.getElementById("searchHistory").value.toLowerCase();
    const historyItems = document.querySelectorAll("#historyList .comment-box");

    historyItems.forEach((item) => {
        const templateName = item.querySelector(".template-name span").textContent.toLowerCase();
        const dueDate = item.querySelector(".due-date span").textContent.toLowerCase();
        const timestamp = item.querySelector(".timestamp span").textContent.toLowerCase();

        if (templateName.includes(searchInput) || dueDate.includes(searchInput) || timestamp.includes(searchInput)) {
            item.style.display = "block";
        } else {
            item.style.display = "none";
        }
    });
}

async function loadStatistics() {
    document.getElementById("loadingOverlay").style.display = "block";
    const statisticsContainer = document.getElementById("statistics");
    statisticsContainer.innerHTML = '<canvas id="statisticsChart"></canvas>';

    try {
        const logsRef = collection(db, "messageLogs");
        const logsSnapshot = await getDocs(logsRef);

        if (logsSnapshot.empty) {
            statisticsContainer.innerHTML = "<p>No statistics available.</p>";
            return;
        }

        let totalMessages = 0;
        let totalSuccess = 0;
        let totalFailed = 0;
        let totalReadReceipts = 0;
        let totalDelivered = 0;
        let totalSent = 0;

        for (const doc of logsSnapshot.docs) {
            const entriesRef = collection(doc.ref, "entries");
            const entriesSnapshot = await getDocs(entriesRef);

            totalMessages += entriesSnapshot.size;

            for (const entryDoc of entriesSnapshot.docs) {
                const entry = entryDoc.data();
                if (entry.status === "success") {
                    totalSuccess += 1;
                } else {
                    totalFailed += 1;
                }

                const logsRef = collection(entryDoc.ref, "logs");
                const logsSnapshot = await getDocs(logsRef);

                logsSnapshot.forEach(logDoc => {
                    const log = logDoc.data();
                    if (log.entry[0].changes[0].value.statuses[0].status === "read") {
                        totalReadReceipts += 1;
                    } else if (log.entry[0].changes[0].value.statuses[0].status === "delivered") {
                        totalDelivered += 1;
                    } else if (log.entry[0].changes[0].value.statuses[0].status === "sent") {
                        totalSent += 1;
                    }
                });
            }
        }

        const ctx = document.getElementById('statisticsChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Total Messages', 'Successful', 'Failed', 'Read Receipts', 'Delivered', 'Sent'],
                datasets: [{
                    label: 'Statistics',
                    data: [totalMessages, totalSuccess, totalFailed, totalReadReceipts, totalDelivered, totalSent],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.2)',
                        'rgba(54, 162, 235, 0.2)',
                        'rgba(255, 99, 132, 0.2)',
                        'rgba(153, 102, 255, 0.2)',
                        'rgba(255, 206, 86, 0.2)',
                        'rgba(75, 192, 192, 0.2)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 99, 132, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });

    } catch (error) {
        console.error("Error loading statistics:", error);
        statisticsContainer.innerHTML = "<p>Error loading statistics.</p>";
    }
    document.getElementById("loadingOverlay").style.display = "none";
}

// Load incoming messages
async function getAuthToken() {
    const user = auth.currentUser;
    if (user) {
        return user.getIdToken();
    } else {
        throw new Error("User is not authenticated");
    }
}

async function loadIncomingMessages() {
    document.getElementById("loadingOverlay").style.display = "block";
    const incomingMessagesList = document.getElementById("incomingMessagesList");
    incomingMessagesList.innerHTML = "";

    try {
        const authToken = await getAuthToken();

        const textMessagesRef = collection(db, "textMessages");
        const textMessagesSnapshot = await getDocs(textMessagesRef);

        if (textMessagesSnapshot.empty) {
            incomingMessagesList.innerHTML = "<li>No incoming messages found.</li>";
        } else {
            textMessagesSnapshot.forEach((doc) => {
                const data = doc.data();
                const messageBox = document.createElement("div");
                messageBox.className = "comment-box";
                messageBox.innerHTML = `
                    <p class="from-text">From: <span>${data.from}</span></p>
                    <p class="comment-date">Date: <span>${new Date(data.timestamp).toLocaleString()}</span></p>
                    <p class="comment-text">Message: <span>${data.text}</span></p>
                `;
                incomingMessagesList.appendChild(messageBox);
            });
        }

        const documentMessagesRef = collection(db, "documentMessages");
        const documentMessagesSnapshot = await getDocs(documentMessagesRef);

        if (!documentMessagesSnapshot.empty) {
            documentMessagesSnapshot.forEach((doc) => {
                const data = doc.data();
                const messageBox = document.createElement("div");
                messageBox.className = "comment-box";
                messageBox.innerHTML = `
                    <p class="from-text">From: <span>${data.from}</span></p>
                    <p class="comment-date">Date: <span>${new Date(data.timestamp).toLocaleString()}</span></p>
                    <p class="comment-text">Document: <a href="${data.mediaUrl}?auth=${authToken}" target="_blank">View Document</a></p>
                `;
                incomingMessagesList.appendChild(messageBox);
            });
        }

        const imageMessagesRef = collection(db, "imageMessages");
        const imageMessagesSnapshot = await getDocs(imageMessagesRef);

        if (!imageMessagesSnapshot.empty) {
            for (const doc of imageMessagesSnapshot.docs) {
                const data = doc.data();
                const response = await fetch(`${data.mediaUrl}?auth=${authToken}`);
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                const messageBox = document.createElement("div");
                messageBox.className = "comment-box";
                messageBox.innerHTML = `
                    <p class="from-text">From: <span>${data.from}</span></p>
                    <p class="comment-date">Date: <span>${new Date(data.timestamp).toLocaleString()}</span></p>
                    <p class="comment-text">Image:</p>
                    <img src="${imageUrl}" alt="Image" style="width:100%; height:auto;" />
                `;
                incomingMessagesList.appendChild(messageBox);
            }
        }
    } catch (error) {
        console.error("Error loading incoming messages:", error);
        incomingMessagesList.innerHTML = "<li>Error loading incoming messages.</li>";
    }
    document.getElementById("loadingOverlay").style.display = "none";
}

// Filter incoming messages
function filterIncomingMessages() {
    const searchInput = document.getElementById("searchIncomingMessages").value.toLowerCase();
    const messageItems = document.querySelectorAll("#incomingMessagesList .comment-box");

    messageItems.forEach((item) => {
        const fromText = item.querySelector(".from-text span").textContent.toLowerCase();
        const commentDate = item.querySelector(".comment-date span").textContent.toLowerCase();
        const commentText = item.querySelector(".comment-text span").textContent.toLowerCase();

        if (fromText.includes(searchInput) || commentDate.includes(searchInput) || commentText.includes(searchInput)) {
            item.style.display = "block";
        } else {
            item.style.display = "none";
        }
    });
}

document.getElementById("startProcessBtn").addEventListener("click", startProcess);
document.getElementById("stopProcessBtn").addEventListener("click", stopProcess);
document.getElementById("message_sender_ui_btn").addEventListener("click", () => toggleView("sender"));
document.getElementById("history_veiwer_ui_btn").addEventListener("click", () => toggleView("history"));
document.getElementById("statistics_ui_btn").addEventListener("click", () => toggleView("statistics"));
document.getElementById("incoming_messages_ui_btn").addEventListener("click", () => {
    toggleView("incomingMessages");
    loadIncomingMessages();
});
document.querySelector(".user-circle").addEventListener("click", () => document.getElementById("userModal").style.display = "block");
document.getElementById("signInButton").addEventListener("click", signIn);
document.getElementById("menu_btn").addEventListener("click", toggleMenu);
document.getElementById("closeModal").addEventListener("click", () => document.getElementById("userModal").style.display = "none");
document.getElementById("searchHistory").addEventListener("input", filterHistory);
document.getElementById("searchIncomingMessages").addEventListener("input", filterIncomingMessages);

populateMessageTemplates();