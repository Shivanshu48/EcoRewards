document.addEventListener("DOMContentLoaded", function () {

  // -------------------------------
  // BASIC SETUP
  // -------------------------------
  const loggedInEmail = localStorage.getItem("loggedInUser");
  if (!loggedInEmail) return (window.location.href = "loginpage.html");

  let userData = null;

  // DOM Elements
  const profileImage = document.getElementById("profile-image");
  const saveProfileBtn = document.getElementById("save-profile-btn");
  const imageUpload = document.getElementById("image-upload");
  const removeImageBtn = document.getElementById("remove-image-btn");

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const mobileInput = document.getElementById("mobile");
  const addressInput = document.getElementById("address");
  const userName = document.getElementById("user-name");

  // -------------------------------
  // LOAD PROFILE FROM MYSQL
  // -------------------------------
  async function loadProfileFromDB() {
    try {
      const res = await fetch(`http://localhost:5000/get-user?email=${loggedInEmail}`);
      const data = await res.json();

      if (!data.success) {
        showNotification("Failed to load profile", "error");
        return;
      }

      userData = data.user;

      userData.stats = {
        ewasteRecycled: 0,
        pickupsCompleted: 0,
        co2Saved: 0,
      };

      updateProfileDisplay();

    } catch (err) {
      console.error(err);
      showNotification("Server error", "error");
    }
  }

  // -------------------------------
  // UPDATE PROFILE UI
  // -------------------------------
  function updateProfileDisplay() {
    userName.textContent = userData.name;
    nameInput.value = userData.name;
    emailInput.value = userData.email;
    mobileInput.value = userData.mobile || "";
    addressInput.value = userData.city || "";
    document.getElementById("eco-points-value").textContent = userData.points || 0;
    document.getElementById("pickups-completed").textContent = userData.pickups_completed || 0;
    document.getElementById("total-ewaste").textContent = userData.ewaste_recycled || 0;
    document.getElementById("co2-saved").textContent = userData.co2_saved || 0;


    // --------------------
//  Dynamic Tier System (FINAL FIXED VERSION)
// --------------------
    // --------------------
// Dynamic Tier System (CORRECTED FOR 100 DEFAULT COINS)
// --------------------
  const points = userData.points || 0;

  let currentTier = "";
  let nextTier = "";
  let progressPercent = 0;

  // --- SILVER TIER (0–200 but visible progress starts only after 100)
  if (points < 200) {
      currentTier = "Silver";
      nextTier = "Gold";

      // progress from 100 → 200
      progressPercent = ((points - 100) / 100) * 100;

      if (progressPercent < 0) progressPercent = 0;
  }

  // --- GOLD TIER (200–500)
  else if (points < 500) {
      currentTier = "Gold";
      nextTier = "Platinum";

      // progress from 200 → 500
      progressPercent = ((points - 200) / 300) * 100;
  }

  // --- PLATINUM TIER (500+)
  else {
      currentTier = "Platinum";
      nextTier = "Max Tier";
      progressPercent = 100;
  }

  // Update labels
  document.getElementById("left-tier").textContent = currentTier;
  document.getElementById("right-tier").textContent = nextTier;

  // Update bar colors
  const bar = document.querySelector(".progress-fill");

  if (currentTier === "Silver") {
      bar.style.background = "#6a93ff";
  } else if (currentTier === "Gold") {
      bar.style.background = "#f4c542";
  } else {
      bar.style.background = "#9b59b6";
  }

  // Animate bar
  bar.style.width = "0%";
  setTimeout(() => {
      bar.style.transition = "width 0.8s ease";
      bar.style.width = progressPercent + "%";
  }, 80);


    initProfileImage();
  }

  // -------------------------------
  // PROFILE IMAGE HANDLING
  // -------------------------------
  function initProfileImage() {
    if (userData.profile_pic) {
      profileImage.innerHTML =
  `<img src="http://localhost:5000/${userData.profile_pic}" alt="Profile Image">`;

      removeImageBtn.style.display = "block";
    } else {
      const initials = (userData.name || "?")
        .split(" ")
        .map((x) => x[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);

      profileImage.innerHTML = `<span class="profile-initials">${initials}</span>`;
      removeImageBtn.style.display = "none";
    }
  }

  document.getElementById("change-image-btn").addEventListener("click", () => imageUpload.click());
  profileImage.addEventListener("click", () => imageUpload.click());

  // -------------------------------
// REAL FILE UPLOAD METHOD (MULTER)
// -------------------------------
imageUpload.addEventListener("change", async function (e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.match("image.*"))
    return showNotification("Invalid image format", "error");

  if (file.size > 5 * 1024 * 1024)
    return showNotification("Image size too large (max 5MB)", "error");

  const formData = new FormData();
  formData.append("profile_pic", file);
  formData.append("email", userData.email);

  try {
    const res = await fetch("http://localhost:5000/upload-profile", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      userData.profile_pic = data.filePath;
      profileImage.innerHTML =
        `<img src="http://localhost:5000/${data.filePath}" alt="Profile">`;

      showNotification("Profile picture updated", "success");
    } else {
      showNotification("Upload failed", "error");
    }
  } catch (err) {
    console.error(err);
    showNotification("Server error", "error");
  }
});


  removeImageBtn.addEventListener("click", async function () {
    await updateProfileOnServer({ profile_pic: null });
  userData.profile_pic = null;
  profileImage.innerHTML =
  `<span class="profile-initials">${initials}</span>`;

  });


  // -------------------------------
  // SAVE PROFILE CHANGES
  // -------------------------------
  saveProfileBtn.addEventListener("click", async function () {
  // Gather values
  const updatedData = {
    name: nameInput.value.trim(),
    mobile: mobileInput.value.trim(),
    city: addressInput.value.trim(),
    profile_pic: userData?.profile_pic ?? null,
  };

  // Client validation
  if (!updatedData.name || !updatedData.mobile || !updatedData.city) {
    showNotification("Please fill Name, Mobile and Address before saving", "error");
    console.warn("Save aborted: validation failed", updatedData);
    return;
  }

  // UI: disable while saving
  saveProfileBtn.disabled = true;
  saveProfileBtn.textContent = "Saving...";

  try {
    console.log("Saving profile ->", updatedData, "email:", loggedInEmail);

    const res = await fetch("http://localhost:5000/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: loggedInEmail,
        name: updatedData.name,
        mobile: updatedData.mobile,
        city: updatedData.city,
        profile_pic: updatedData.profile_pic
      })
    });

    const text = await res.text(); // read raw text for better error debugging
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // non-json response
      console.error("Non-JSON response from server:", text);
      showNotification("Server returned unexpected response. Check console.", "error");
      return;
    }

    console.log("Update-profile response:", res.status, data);

    if (!res.ok || !data.success) {
      // show server message if present
      const msg = data?.message || `Save failed (status ${res.status})`;
      showNotification(msg, "error");
      console.warn("Profile save failed:", data);
    } else {
      // Success: update local state from server's returned user (if provided)
      if (data.user) {
        userData = data.user;
      } else {
        Object.assign(userData, updatedData);
      }
      updateProfileDisplay();
      showNotification("Changes saved successfully ✔", "success");
    }

  } catch (err) {
    console.error("Error while saving profile:", err);
    showNotification("Network/server error while saving. See console.", "error");

    // Optional fallback: update UI locally so user sees change
    Object.assign(userData, updatedData);
    updateProfileDisplay();
  } finally {
    saveProfileBtn.disabled = false;
    saveProfileBtn.textContent = "Save Changes";
  }
});

  // -------------------------------
  // UPDATE PROFILE IN MYSQL
  // -------------------------------
  async function updateProfileOnServer(updateObj) {
    const body = {
      email: loggedInEmail,
      name: updateObj.name ?? userData.name,
      mobile: updateObj.mobile ?? userData.mobile,
      city: updateObj.city ?? userData.city,
      profile_pic: updateObj.profile_pic ?? userData.profile_pic,
    };

    const res = await fetch("http://localhost:5000/update-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.success) {
      showNotification("Update failed", "error");
    }
  }

  // -------------------------------
  // LOAD PICKUPS FROM MYSQL
  // -------------------------------
  async function loadPickups() {
    try {
      const res = await fetch(`http://localhost:5000/get-pickups?email=${loggedInEmail}`);
      const pickups = await res.json();

      renderPickups(pickups);
    } catch (err) {
      console.error(err);
    }
  }

  // -------------------------------
  // RENDER PICKUPS UI
  // -------------------------------
  function renderPickups(pickups) {
  const container = document.getElementById("scheduled-pickups");
  container.innerHTML = "";

  if (!pickups.length) {
    container.innerHTML = "<p style='text-align:center;color:#666;'>No pickups found</p>";
    return;
  }

  pickups.forEach((p) => {
    const d = new Date(p.preferred_date);
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();

    let status = p.status;

    container.innerHTML += `
      <div class="pickup-item ${status}">
        <div class="pickup-date">
          <div class="pickup-month">${month}</div>
          <div class="pickup-day">${day}</div>
        </div>

        <div class="pickup-details">
          <div class="pickup-title">E-Waste Pickup</div>
          <div class="pickup-time">${p.preferred_time}</div>
          <div class="pickup-address">${p.address}</div>
        </div>

        <div class="pickup-status">${status}</div>

        ${
          status === "completed"
            ? `
              <div class="pickup-result">
                <span>${p.items || ""}</span>
                <span>+${p.fee * 3} EcoPoints</span>
              </div>
            `
            : status === "cancelled"
            ? `
              <div class="pickup-result">
                <span style="color:#e74c3c;">Pickup Cancelled</span>
              </div>
            `
            : `
              <div class="pickup-actions">
                <button class="btn btn-small btn-outline">Reschedule</button>
                <button class="btn btn-small btn-outline btn-danger cancel-pickup-btn" data-id="${p.id}">
                  Cancel
                </button>
              </div>
            `
        }
      </div>
    `;
  });
}

  // -------------------------------
  // PICKUP MODAL LOGIC
  // -------------------------------
  document.getElementById("schedulePickupBtn").addEventListener("click", () => {
    document.getElementById("pickup-modal").style.display = "flex";

    document.getElementById("p_name").value = userData?.name || "";
    document.getElementById("p_address").value = userData?.city || "";
  });

  document.getElementById("closePickupModal").addEventListener("click", () => {
    document.getElementById("pickup-modal").style.display = "none";
  });

  document.getElementById("pickupForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const pickupData = {
      name: document.getElementById("p_name").value,
      phone: document.getElementById("p_phone").value,
      address: document.getElementById("p_address").value,
      date: document.getElementById("p_date").value,
      time: document.getElementById("p_time").value,
      items: document.getElementById("p_items").value,
      email: userData.email,
    };

    try {
      const res = await fetch("http://localhost:5000/schedule-pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pickupData),
      });

      const data = await res.json();

      if (data.success) {
        showNotification("Pickup scheduled!", "success");
        document.getElementById("pickup-modal").style.display = "none";
        loadPickups();
      } else {
        showNotification(data.message, "error");
      }

    } catch (err) {
      console.error(err);
      showNotification("Server error", "error");
    }
  });

  // -------------------------------
  // LOGOUT
  // -------------------------------
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("loggedInUser");
    window.location.href = "index.html";
  });

  // -------------------------------
  // NOTIFICATIONS
  // -------------------------------
  function showNotification(message, type = "info") {
  // Create notification element
  const notif = document.createElement("div");
  notif.className = `popup-notification ${type}`;
  notif.innerHTML = message;

  document.body.appendChild(notif);

  // Force reflow so animation works
  setTimeout(() => notif.classList.add("visible"), 50);

  // Hide after 3 sec
  setTimeout(() => {
    notif.classList.remove("visible");
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

const deleteModal = document.getElementById("delete-modal");
const deleteAccountBtn = document.getElementById("delete-account-btn");
const cancelDelete = document.getElementById("cancel-delete");
const confirmDelete = document.getElementById("confirm-delete");

// Open modal
deleteAccountBtn.addEventListener("click", () => {
  deleteModal.style.display = "flex";
});

// Close modal
cancelDelete.addEventListener("click", () => {
  deleteModal.style.display = "none";
});

  // -------------------------------
  // INIT PAGE
  // -------------------------------
  loadProfileFromDB();
  loadPickups();

  // CANCEL PICKUP (DELEGATED LISTENER)
document.getElementById("scheduled-pickups").addEventListener("click", async (e) => {
  const el = e.target;

  if (el.classList.contains("cancel-pickup-btn")) {
    const pickupId = el.getAttribute("data-id");
    if (!pickupId) return;

    if (!confirm("Are you sure you want to cancel this pickup?")) return;

    try {
      el.disabled = true;
      el.textContent = "Cancelling...";

      const res = await fetch("http://localhost:5000/cancel-pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupId: Number(pickupId),
          email: userData.email
        })
      });

      const data = await res.json();
      if (data.success) {
        showNotification("Pickup cancelled", "success");
        loadPickups();
      } else {
        showNotification(data.message || "Cancel failed", "error");
      }
    } catch (err) {
      console.error(err);
      showNotification("Server error", "error");
    } finally {
      el.disabled = false;
      el.textContent = "Cancel";
    }
  }
});
confirmDelete.addEventListener("click", async () => {
  try {
    confirmDelete.disabled = true;
    confirmDelete.textContent = "Deleting...";

    const res = await fetch("http://localhost:5000/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: userData.email })
    });

    const data = await res.json();

    if (data.success) {
      showNotification("Account deleted successfully", "success");

      localStorage.removeItem("loggedInUser");

      setTimeout(() => window.location.href = "index.html", 800);
    } else {
      showNotification(data.message || "Delete failed", "error");
    }

  } catch (err) {
    console.error(err);
    showNotification("Server error", "error");
  } finally {
    confirmDelete.disabled = false;
    confirmDelete.textContent = "Delete Permanently";
  }

  

});

});
