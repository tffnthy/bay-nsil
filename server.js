const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const app = express();

app.use(express.urlencoded({ extended: true }));
const db = mysql.createConnection({
    host: 'localhost',  // Replace with your host
    user: 'root',       // Replace with your MySQL username
    password: 'Tiff@britney',       // Replace with your MySQL password
    database: 'baynsil'  // Replace with your database name
  });
 
  db.connect((err) => {
    if (err) {
      console.error('Error connecting to the database:', err);
    } else {
      console.log('Connected to MySQL database');
    }
  });

function ensureAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  } else {
    res.redirect('/login'); 
  }
}

app.use(
  session({
    secret: 'your-secret-key', 
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } 
  })
);

const uploadPath = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/addlisting', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'addlisting.html'));
});

app.get('/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/useritems', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'useritems.html'));
});

app.get('/homepage', ensureAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'homepage.html'));
});

app.get('/userinfo', ensureAuthenticated, (req, res) => {
  const user = req.session.user; // Get the session user data
  res.json(user); // Send the user data as JSON to the client
});

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: (req, file, cb) => {
    const fileExtension = path.extname(file.originalname);
    const filename = Date.now() + fileExtension;
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

app.post('/additem', upload.single('image'), (req, res) => {
  console.log('File uploaded:', req.file);
  const { item_name, price } = req.body;
  const seller_id = req.session.user.id; // Get the user ID from the session
  const image = req.file ? `/uploads/${req.file.filename}` : null; // Get the image path if available
  
  const sql = 'INSERT INTO listings (seller_id, item_name, price, image) VALUES (?, ?, ?, ?)';
  db.query(sql, [seller_id, item_name, price, image], (err, result) => {
    if (err) {
      console.error(err);
      return res.send('Error while adding listing');
    }
    res.redirect('/homepage'); // Redirect after successful listing
  });
});

app.get('/api/mysellerlistings', ensureAuthenticated, (req, res) => {
  const sellerId = req.session.user.id;  // Get the logged-in user's seller ID
  const sql = 'SELECT * FROM listings WHERE seller_id = ? ORDER BY item_id DESC';

  db.query(sql, [sellerId], (err, results) => {
    if (err) {
      console.error('Error fetching listings:', err);
      return res.status(500).json({ error: 'Failed to fetch listings' });
    }
    res.json(results);  // Send the listings specific to the logged-in user
  });
});

app.get('/api/shoplistings', (req, res) => {
  const sql = 'SELECT * FROM listings ORDER BY item_id DESC';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching listings:', err);
      return res.status(500).json({ error: 'Failed to fetch listings' });
    }
    res.json(results);
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.send('❌ Failed to log out.');
    }
    res.redirect('/'); // Or wherever you want after logout
  });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async(err, results) => {
        if(err){
            console.error(err);
            return res.send('Error while checking credentials');
        }

        if(results.length > 0){
            const user = results[0];
            const passwordMatch = await bcrypt.compare(password, user.password);
            if(passwordMatch){
              req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email
              };
                return res.redirect('/homepage');
            } else {
                return res.redirect('/login?error=true');
            }
        }else {
              return res.redirect('/login?error=true');
        }
    })
})

app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const saltRounds = 10;
  
    // Check if email already exists
    const checkEmailSql = 'SELECT * FROM users WHERE email = ?';
    db.query(checkEmailSql, [email], async (err, results) => {
      if (err) {
        console.error(err);
        return res.send('❌ Error checking email.');
      }
  
      if (results.length > 0) {
        // Email exists, redirect back with query
        return res.redirect(`/login?emailExists=true&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`);
      }
  
      // Email is unique, hash password and insert
      try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const insertSql = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
        db.query(insertSql, [name, email, hashedPassword], (err, result) => {
          if (err) {
            console.error(err);
            return res.send('❌ Failed to register.');
          }
          res.redirect('/success');
        });
      } catch (error) {
        console.error(error);
        res.send('❌ Error hashing password.');
      }
    });
});

app.delete('/api/deleteitem/:id', (req, res) => {
  const itemId = req.params.id;
  const sellerId = req.session.user.id;

  const sql = 'DELETE FROM listings WHERE item_id = ? AND seller_id = ?';
  db.query(sql, [itemId, sellerId], (err, result) => {
    if (err) {
      console.error('Error deleting item:', err);
      return res.status(500).json({ error: 'Failed to delete item' });
    }

    if (result.affectedRows === 0) {
      return res.status(403).json({ error: 'You are not authorized to delete this item' });
    }

    res.json({ success: true });
  });
});

// Load items when page loads
document.addEventListener('DOMContentLoaded', function() {
  loadUserItems();
});

function loadUserItems() {
  const itemsContainer = document.getElementById('listings-container');
  const emptyState = document.getElementById('empty-state');
  
  // Get items from localStorage
  const items = JSON.parse(localStorage.getItem('userItems')) || [];
  
  if (items.length === 0) {
    itemsContainer.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  itemsContainer.classList.remove('hidden');
  itemsContainer.innerHTML = ''; // Clear existing items
  
  // Add each item to the container
  items.forEach(item => {
    const itemElement = createItemElement(item);
    itemsContainer.appendChild(itemElement);
  });
}

function createItemElement(item) {
  const itemElement = document.createElement('div');
  itemElement.className = 'bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300';
  
  itemElement.innerHTML = `
    <div class="bg-gray-200 h-48 flex items-center justify-center relative">
      ${item.image ? 
        `<img src="${item.image}" alt="${item.name}" class="h-full w-full object-cover">` : 
        `<span class="text-gray-500">Product Image</span>`}
      <div class="absolute top-2 right-2 flex space-x-1">
        <button class="edit-btn p-1 bg-white rounded-full shadow-md hover:bg-gray-100" data-id="${item.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
        <button class="delete-btn p-1 bg-white rounded-full shadow-md hover:bg-gray-100" data-id="${item.id}">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
    <div class="p-4">
      <h3 class="font-semibold text-lg mb-1">${item.name}</h3>
      <p class="text-gray-600 text-sm mb-2">${item.category}</p>
      <div class="flex justify-between items-center">
        <span class="font-bold text-primary-600">$${item.price}</span>
        <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">${item.status}</span>
      </div>
    </div>
  `;
  
  // Add event listeners for edit and delete
  itemElement.querySelector('.delete-btn').addEventListener('click', function() {
    deleteItem(item.id);
  });
  
  return itemElement;
}

function deleteItem(itemId) {
  if (confirm('Are you sure you want to delete this item?')) {
    let items = JSON.parse(localStorage.getItem('userItems')) || [];
    items = items.filter(item => item.id !== itemId);
    localStorage.setItem('userItems', JSON.stringify(items));
    loadUserItems(); // Refresh the list
  }
}



// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
