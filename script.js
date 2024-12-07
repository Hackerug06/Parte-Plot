import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ImageBackground, 
  FlatList, 
  Platform 
} from 'react-native';
import * as ImagePicker from 'react-native-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import storage from '@react-native-firebase/storage';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "parte-plot.firebaseapp.com",
  projectId: "parte-plot",
  storageBucket: "parte-plot.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Interfaces
interface User {
  uid: string;
  phoneNumber: string;
  displayName?: string;
  email?: string;
}

interface Party {
  id?: string;
  hostId: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  whatsappGroupLink: string;
  images: string[];
  invitedGuests: string[];
}

// Authentication Service
class AuthService {
  async sendVerificationCode(phoneNumber: string) {
    try {
      const confirmation = await auth().signInWithPhoneNumber(phoneNumber);
      return confirmation;
    } catch (error) {
      console.error('Error sending verification code:', error);
      throw error;
    }
  }

  async confirmVerificationCode(confirmation: any, code: string) {
    try {
      const userCredential = await confirmation.confirm(code);
      return userCredential.user;
    } catch (error) {
      console.error('Invalid verification code:', error);
      throw error;
    }
  }

  getCurrentUser(): User | null {
    const user = auth().currentUser;
    return user ? {
      uid: user.uid,
      phoneNumber: user.phoneNumber || '',
      displayName: user.displayName || '',
      email: user.email || ''
    } : null;
  }

  async signOut() {
    try {
      await auth().signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }
}

// Party Service
class PartyService {
  private partiesCollection = firestore().collection('parties');

  async createParty(partyData: Party): Promise<string> {
    try {
      const docRef = await this.partiesCollection.add(partyData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating party:', error);
      throw error;
    }
  }

  async uploadPartyImages(partyId: string, imageUris: string[]): Promise<string[]> {
    const uploadPromises = imageUris.map(async (uri, index) => {
      const filename = `${partyId}_image_${index}_${Date.now()}`;
      const reference = storage().ref(`party_images/${filename}`);
      
      const fileUri = Platform.OS === 'ios' ? uri : `file://${uri}`;
      
      await reference.putFile(fileUri);
      return await reference.getDownloadURL();
    });

    return Promise.all(uploadPromises);
  }

  async getPartiesByHost(hostId: string): Promise<Party[]> {
    try {
      const snapshot = await this.partiesCollection
        .where('hostId', '==', hostId)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Party));
    } catch (error) {
      console.error('Error fetching host parties:', error);
      throw error;
    }
  }

  async getInvitedParties(userId: string): Promise<Party[]> {
    try {
      const snapshot = await this.partiesCollection
        .where('invitedGuests', 'array-contains', userId)
        .get();
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Party));
    } catch (error) {
      console.error('Error fetching invited parties:', error);
      throw error;
    }
  }
}

// Instantiate Services
const authService = new AuthService();
const partyService = new PartyService();

// Create Stack Navigator
const Stack = createStackNavigator();

// Login Screen
const LoginScreen = ({ navigation }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmation, setConfirmation] = useState(null);

  const sendVerificationCode = async () => {
    try {
      const confirmationResult = await authService.sendVerificationCode(phoneNumber);
      setConfirmation(confirmationResult);
    } catch (error) {
      console.error('Verification code sending failed', error);
    }
  };

  const confirmVerificationCode = async () => {
    try {
      await authService.confirmVerificationCode(confirmation, verificationCode);
      navigation.navigate('Dashboard');
    } catch (error) {
      console.error('Code confirmation failed', error);
    }
  };

  return (
    <ImageBackground 
      source={require('./assets/beach-party-background.jpg')} 
      style={styles.background}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Parte Plot</Text>
        
        {!confirmation ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Enter WhatsApp Number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <TouchableOpacity 
              style={styles.button} 
              onPress={sendVerificationCode}
            >
              <Text style={styles.buttonText}>Send Verification Code</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Enter Verification Code"
              value={verificationCode}
              onChangeText={setVerificationCode}
              keyboardType="numeric"
            />
            <TouchableOpacity 
              style={styles.button} 
              onPress={confirmVerificationCode}
            >
              <Text style={styles.buttonText}>Verify Code</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ImageBackground>
  );
};

// Dashboard Screen
const DashboardScreen = ({ navigation }) => {
  const [hostedParties, setHostedParties] = useState([]);
  const [invitedParties, setInvitedParties] = useState([]);

  useEffect(() => {
    const fetchParties = async () => {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        const hosted = await partyService.getPartiesByHost(currentUser.uid);
        const invited = await partyService.getInvitedParties(currentUser.uid);
        
        setHostedParties(hosted);
        setInvitedParties(invited);
      }
    };

    fetchParties();
  }, []);

  const renderPartyCard = (party, isHost) => (
    <TouchableOpacity 
      style={styles.partyCard}
      onPress={() => navigation.navigate('PartyDetails', { party, isHost })}
    >
      <Text style={styles.partyTitle}>{party.title}</Text>
      <Text>{party.location} - {party.date} {party.time}</Text>
    </TouchableOpacity>
  );

  return (
    <ImageBackground 
      source={require('./assets/beach-party-background.jpg')} 
      style={styles.background}
    >
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>Hosted Parties</Text>
        <FlatList
          data={hostedParties}
          renderItem={({ item }) => renderPartyCard(item, true)}
          keyExtractor={(item) => item.id}
        />

        <Text style={styles.sectionTitle}>Invited Parties</Text>
        <FlatList
          data={invitedParties}
          renderItem={({ item }) => renderPartyCard(item, false)}
          keyExtractor={(item) => item.id}
        />

        <TouchableOpacity
          style={styles.createPartyButton}
          onPress={() => navigation.navigate('CreateParty')}
        >
          <Text style={styles.createPartyButtonText}>Create New Party</Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

// Create Party Screen
const CreatePartyScreen = ({ navigation }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [whatsappGroupLink, setWhatsappGroupLink] = useState('');
  const [images, setImages] = useState([]);

  const pickImages = () => {
    ImagePicker.launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 5,
    }, (response) => {
      if (response.didCancel) {
        console.log('Image selection cancelled');
      } else if (response.errorCode) {
        console.log('ImagePicker Error: ', response.errorMessage);
      } else {
        setImages(response.assets.map(asset => asset.uri));
      }
    });
  };

  const createParty = async () => {
    try {
      const currentUser = authService.getCurrentUser();
      if (!currentUser) {
        console.error('No user logged in');
        return;
      }

      const partyData: Party = {
        hostId: currentUser.uid,
        title,
        description,
        location,
        date: date.toLocaleDateString(),
        time: time.toLocaleTimeString(),
        whatsappGroupLink,
        images: [],
        invitedGuests: []
      };

      const partyId = await partyService.createParty(partyData);
      
      // Upload images if any
      if (images.length > 0) {
        const uploadedImageUrls = await partyService.uploadPartyImages(partyId, images);
        
        // Update party with image URLs
        await firestore().collection('parties').doc(partyId).update({
          images: uploadedImageUrls
        });
      }

      navigation.navigate('Dashboard');
    } catch (error) {
      console.error('Party creation failed:', error);
    }
  };

  return (
    <ImageBackground 
      source={require('./assets/beach-party-background.jpg')} 
      style={styles.background}
    >
      <ScrollView>
        <View style={styles.container}>
          <Text style={styles.title}>Create Party</Text>
          
          <TextInput
            style={styles.input}
            placeholder="Party Title"
            value={title}
            onChangeText={setTitle}
          />
          
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Party Description"
            value={description}
            onChangeText={setDescription}
            multiline
          />
          
          <TextInput
            style={styles.input}
            placeholder="Location"
            value={location}
            onChangeText={setLocation}
          />
          
          <View style={styles.dateTimeContainer}>
            <Text>Date:</Text>
            <DateTimePicker
              value={date}
              mode="date"
              onChange={(event, selectedDate) => setDate(selectedDate)}
            />
          </View>
          
          <View style={styles.dateTimeContainer}>
            <Text>Time:</Text>
            <DateTimePicker
              value={time}
              mode="time"
              onChange={(event, selectedTime) => setTime(selectedTime)}
            />
          </View>
          
          <TextInput
            style={styles.input}
            placeholder="WhatsApp Group Link"
            value={whatsappGroupLink}
            onChangeText={setWhatsappGroupLink}
          />
          
          <TouchableOpacity 
            style={styles.button} 
            onPress={pickImages}
          >
            <Text style={styles.buttonText}>Upload Party Images</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.createPartyButton} 
            onPress={createParty}
          >
            <Text style={styles.createPartyButtonText}>Create Party</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ImageBackground>
  );
};

// Styles
const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    height: 50,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  multilineInput: {
    height: 100,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  dateTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  partyCard: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
  },
  partyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  createPartyButton: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 20,
  },
  createPartyButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

// Main App Component
const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }}
        />
        <Stack.Screen 
          name="Dashboard" 
          component={DashboardScreen} 
          options={{ title: 'Parte Plot Dashboard' }}
        />
        <Stack.Screen 
          name</antArtifact>
